import 'dart:async';

import '../../../strategy_research/data/auth/mstock_jwt_manager.dart';
import '../../../strategy_research/data/constants/strategy_research_api_keys.dart';
import '../../../strategy_research/data/repositories/strategy_research_repository_impl.dart';
import '../../../strategy_research/data/sources/remote/mstock_api_helpers.dart';
import '../../../strategy_research/data/sources/remote/mstock_api_client.dart';
import '../../../strategy_research/data/sources/remote/mstock_order_client.dart';
import '../../../strategy_research/data/sources/remote/strategy_research_remote_service.dart';
import '../../domain/entities/niftyoptima_models.dart';
import '../../domain/repositories/i_niftyoptima_repository.dart';
import '../constants/niftyoptima_api_config.dart';
import '../local/breakout_analysis.dart';
import '../local/daily_best_buy.dart';
import '../local/local_equity_analyzer.dart';
import '../local/local_market_helpers.dart';
import '../../../strategy_research/data/sources/remote/mstock_scrip_master.dart';
import '../local/public_nifty_spot.dart';
import '../local/local_order_store.dart';
import '../local/local_watchlist_store.dart';
import '../sources/remote/niftyoptima_remote_client.dart';

/// On-device implementation — mStock API + daily best-buy engine (mirrors stat_react).
class StandaloneNiftyOptimaRepositoryImpl implements INiftyOptimaRepository {
  StandaloneNiftyOptimaRepositoryImpl({
    StrategyResearchRemoteService? strategyRemote,
    MstockApiClient? mstock,
    MstockOrderClient? orderClient,
    MstockScripMaster? scripMaster,
    NiftyOptimaRemoteClient? remoteClient,
  })  : _strategy = StrategyResearchRepositoryImpl(
          strategyRemote ?? StrategyResearchRemoteService(),
        ),
        _mstock = mstock ?? MstockApiClient(),
        _orderClient = orderClient,
        _scripMaster = scripMaster,
        _remote = remoteClient,
        _publicNifty = PublicNiftySpot();

  final StrategyResearchRepositoryImpl _strategy;
  final MstockApiClient _mstock;
  MstockOrderClient? _orderClient;
  MstockScripMaster? _scripMaster;
  NiftyOptimaRemoteClient? _remote;
  final PublicNiftySpot _publicNifty;

  /// Lazy init survives hot reload when new fields were added after first construct.
  MstockOrderClient get _ordersApi => _orderClient ??= MstockOrderClient();
  MstockScripMaster get _scrip => _scripMaster ??= MstockScripMaster();
  NiftyOptimaRemoteClient get _remoteApi => _remote ??= NiftyOptimaRemoteClient();
  final _orders = LocalOrderStore.instance;
  final _watchlist = LocalWatchlistStore.instance;

  Timer? _pollTimer;
  bool _polling = false;
  DailyBuyState _dailyBuyState = const DailyBuyState();
  String? _lastEmittedSignalKey;

  final _connected = StreamController<bool>.broadcast();
  final _ticks = StreamController<TickPayload>.broadcast();
  final _signals = StreamController<SignalPayload>.broadcast();
  final _orderLogs = StreamController<OrderLogEntry>.broadcast();

  @override
  Stream<bool> get socketConnected => _connected.stream;

  @override
  Stream<TickPayload> get ticks => _ticks.stream;

  @override
  Stream<SignalPayload> get signals => _signals.stream;

  @override
  Stream<OrderLogEntry> get orderLogs => _orderLogs.stream;

  @override
  void connectSocket() {
    if (_polling) return;
    _polling = true;
    _connected.add(true);
    _pollOnce();
    _pollTimer = Timer.periodic(const Duration(minutes: 1), (_) => _pollOnce());
  }

  @override
  void disconnectSocket() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _polling = false;
    _connected.add(false);
  }

  @override
  Future<void> pollStrategyOnce() => _pollOnce();

  Future<void> _pollOnce() async {
    final spotRest = await fetchNiftySpot();
    final spot = spotRest.spot;
    if (spot == null) return;

    final bars = spotRest.bars1m;
    final breakout = evaluateBreakoutContext(bars, spot);
    final ctx = dailyBuyContextFromBreakout(breakout);

    final dayKey = istDateKey();
    final openPosition = openPositionForDay(dayKey);
    final hasOpenPosition = openPosition != null;

    final daily = resolveDailyBestBuy(
      state: _dailyBuyState,
      spot: spot,
      ctx: ctx,
      chainRows: spotRest.optionChain,
      hasOpenPosition: hasOpenPosition,
      openPosition: openPosition,
    );

    _syncDailyBuyState(daily);

    final activeSignal =
        daily.suppressedByPosition ? null : daily.signal;

    if (daily.isNewSignal && activeSignal != null) {
      final emitKey =
          '${daily.dayKey}-${activeSignal.side}-${activeSignal.strike}-${activeSignal.ts}';
      if (emitKey != _lastEmittedSignalKey) {
        _lastEmittedSignalKey = emitKey;
        _signals.add(activeSignal);
      }
    }

    final strategyRules = <String, StrategyRuleLeg?>{
      'ce': breakout.rules.ce,
      'pe': breakout.rules.pe,
    };

    final dailyBestBuy = DailyBestBuy(
      confidence: activeSignal?.confidence,
      ceScore: daily.ceScore,
      peScore: daily.peScore,
      dayKey: daily.dayKey,
      signalsToday: daily.signalsToday,
      signal: activeSignal,
      suppressedByPosition: daily.suppressedByPosition,
      hasOpenPosition: hasOpenPosition,
      holdSuggestion: daily.holdSuggestion,
    );

    _ticks.add(TickPayload(
      ts: DateTime.now().millisecondsSinceEpoch,
      spot: spot,
      dayChange: spotRest.dayChange,
      rsi: breakout.rsi,
      atm: spotRest.atm ?? atmStrikeFromSpot(spot),
      optionChain: spotRest.optionChain,
      sentiment: breakout.rsi ?? 0,
      bars1m: bars,
      indexSource: spotRest.indexSource,
      indexError: spotRest.indexError,
      indexFromLastCandle: spotRest.indexFromLastCandle,
      strategyRules: strategyRules,
      dailyBestBuy: dailyBestBuy,
    ));
  }

  void _syncDailyBuyState(DailyBestBuyResult daily) {
    if (daily.dayKey != _dailyBuyState.dayKey) {
      _dailyBuyState = const DailyBuyState();
      _lastEmittedSignalKey = null;
    }

    if (daily.isNewSignal && daily.signal != null) {
      _dailyBuyState = DailyBuyState(
        dayKey: daily.dayKey,
        emittedKeys: daily.emittedKeys,
        signalsToday: daily.signalsToday,
        lastSignal: daily.lastSignal,
        ceScore: daily.ceScore,
        peScore: daily.peScore,
      );
    } else {
      _dailyBuyState = _dailyBuyState.copyWith(
        dayKey: daily.dayKey,
        ceScore: daily.ceScore,
        peScore: daily.peScore,
      );
    }
  }

  @override
  Future<NiftySpotRest> fetchNiftySpot() async {
    final live = await _strategy.getLiveNiftyLtp();
    final hasJwt = StrategyResearchApiKeys.jwtToken.isNotEmpty;
    final hasKey = StrategyResearchApiKeys.apiKey.isNotEmpty;

    if (!hasKey) {
      return const NiftySpotRest(
        spot: null,
        atm: null,
        optionChain: [],
        bars1m: [],
        indexSource: 'mock',
        indexError: 'Set MSTOCK_API_KEY in .env',
        indexFromLastCandle: false,
        polledAt: 0,
      );
    }

    final to = DateTime.now();
    final from = to.subtract(const Duration(days: 2));
    final fromStr =
        '${from.year}-${_pad(from.month)}-${_pad(from.day)} 09:15';
    final toStr = '${to.year}-${_pad(to.month)}-${_pad(to.day)} 15:30';

    var bars = <MinuteBar>[];
    final hist = await _mstock.getHistoricalCandles(
      exchange: 'NSE',
      symbolToken: '',
      interval: 'ONE_MINUTE',
      fromDate: fromStr,
      toDate: toStr,
    );
    if (hist.isSuccess) {
      bars = candlesToMinuteBars(hist.candles);
    }

    var spot = live.ltp;
    var indexError = live.error;
    if (spot != null && indexError.isEmpty && !hasJwt) {
      indexError = 'Auto TOTP login pending (using candle fallback)';
    }

    double? explicitPrevClose;
    if (spot == null || bars.isEmpty) {
      final pub = await _publicNifty.fetchIntraday();
      if (pub.ltp != null) {
        spot ??= pub.ltp;
        if (bars.isEmpty && pub.bars.isNotEmpty) bars = pub.bars;
        explicitPrevClose = pub.previousClose;
        if (indexError.isEmpty || isMstockIpMismatch(indexError)) {
          indexError =
              'Delayed Yahoo ^NSEI — whitelist phone IP on mStock for broker LTP.';
        }
      }
    }

    final chain = spot != null ? buildSimulatedOptionChain(spot) : <OptionChainRow>[];

    String indexSource = 'pending';
    if (spot != null && !live.fromLastCandle && hasJwt && live.ltp != null) {
      indexSource = 'mstock';
    } else if (spot != null && live.fromLastCandle) {
      indexSource = 'mstock';
    } else if (spot != null) {
      indexSource = 'public';
    }

    final closes = bars.map((b) => b.close).toList();
    final rsi = computeWilderRsi(closes) ?? computeRsi(closes);
    final dayChange = spot != null
        ? computeNiftyDayChange(
            spot,
            bars,
            explicitPrevClose: explicitPrevClose,
          )
        : null;

    return NiftySpotRest(
      spot: spot,
      dayChange: dayChange,
      atm: spot != null ? atmStrikeFromSpot(spot) : null,
      optionChain: chain,
      chainSource: 'sim',
      bars1m: bars,
      rsi: rsi,
      indexSource: indexSource,
      indexError: spot != null ? indexError : live.error,
      indexFromLastCandle: live.fromLastCandle,
      polledAt: DateTime.now().millisecondsSinceEpoch,
    );
  }

  @override
  Future<NiftyHistoryRest> fetchNiftyHistory({int tradingDays = 5}) async {
    if (StrategyResearchApiKeys.apiKey.isEmpty) {
      return NiftyHistoryRest(
        bars: const [],
        tradingDays: tradingDays,
        indexSource: 'mock',
        indexError: 'Set MSTOCK_API_KEY in .env',
        polledAt: 0,
      );
    }

    final to = DateTime.now();
    final from = to.subtract(Duration(days: tradingDays * 2 + 5));
    final hist = await _mstock.getHistoricalCandles(
      exchange: 'NSE',
      symbolToken: '',
      interval: 'ONE_DAY',
      fromDate: '${from.year}-${_pad(from.month)}-${_pad(from.day)} 09:15',
      toDate: '${to.year}-${_pad(to.month)}-${_pad(to.day)} 15:30',
    );

    var bars = hist.isSuccess ? candlesToMinuteBars(hist.candles) : <MinuteBar>[];
    if (bars.length > tradingDays) {
      bars = bars.sublist(bars.length - tradingDays);
    }

    return NiftyHistoryRest(
      bars: bars,
      tradingDays: tradingDays,
      indexSource: bars.isNotEmpty ? 'mstock' : 'mock',
      indexError: bars.isEmpty ? hist.message : '',
      polledAt: DateTime.now().millisecondsSinceEpoch,
    );
  }

  @override
  Future<OrderLogResponse> fetchOrderLog({String? day}) async {
    final d = day ?? LocalOrderStore.istDayKey();

    if (NiftyOptimaApiConfig.hasRemoteBackend) {
      try {
        final remote = await _remoteApi.fetchOrderLog(day: d);
        if (remote != null) {
          _orders.replaceDayLogs(d, remote.logs, autoTrading: remote.autoTrading);
        }
      } catch (_) {
        // Server sync is best-effort.
      }
    }

    try {
      await _syncFromMstockOrderBook(d);
    } catch (_) {
      // Order book sync is best-effort; never block the local log.
    }
    return OrderLogResponse(
      day: d,
      logs: _orders.logsForDay(d),
      autoTrading: _orders.autoTrading,
    );
  }

  Future<void> _syncFromMstockOrderBook(String dayKey) async {
    final useRemoteBook = NiftyOptimaApiConfig.hasRemoteBackend;
    if (!useRemoteBook && !await _ensureMstockSession()) return;
    final book = useRemoteBook
        ? await _remoteApi.fetchMstockOrderBook()
        : await _ordersApi.fetchOrderBook();
    if (book.isEmpty) return;

    for (final row in book) {
      final tx = row['transactiontype']?.toString().toUpperCase();
      if (tx != 'BUY') continue;
      final tradingsymbol = row['tradingsymbol']?.toString() ?? '';
      if (tradingsymbol.isEmpty) continue;

      final orderId = parseMstockOrderId({'data': row}) ??
          (row['orderid'] ?? row['uniqueorderid'] ?? '').toString().trim();
      if (orderId.isEmpty) continue;

      final brokerStatus =
          (row['status'] ?? row['orderstatus'] ?? 'submitted').toString();
      final status = mapMstockOrderBookStatus(brokerStatus);

      if (_orders.hasOrderId(orderId)) {
        _orders.updateStatus(orderId, status);
        continue;
      }

      final upper = tradingsymbol.toUpperCase();
      final recoveredStatus =
          status == 'submitted' && !upper.contains('NIFTY') ? 'open' : status;
      final qty = int.tryParse(row['quantity']?.toString() ?? '') ?? 0;
      final price = double.tryParse(row['price']?.toString() ?? '') ??
          double.tryParse(row['averageprice']?.toString() ?? '') ??
          0;

      if (upper.contains('NIFTY')) {
        final parsed = parseNiftyOptionSymbol(tradingsymbol);
        if (parsed == null) continue;
        _orders.recoverFailedBuy(
          orderId: orderId,
          status: recoveredStatus,
          strike: parsed.strike,
          optionType: parsed.optionType,
        );
        if (_orders.hasOrderId(orderId)) continue;
        final lotsize = int.tryParse(row['lotsize']?.toString() ?? '') ??
            defaultNiftyLotSize();
        final lots = lotsize > 0 ? (qty / lotsize).round().clamp(1, 999) : 1;
        final entry = _orders.addBuy(
          strike: parsed.strike,
          optionType: parsed.optionType,
          entry: price > 0 ? price : 0,
          sl: 0,
          tgt: 0,
          lots: lots,
          lotsize: lotsize,
          mock: false,
          brokerOrderId: orderId,
          trigger: 'manual',
          message: 'Synced from mStock order book',
          status: recoveredStatus,
        );
        _orderLogs.add(entry);
        continue;
      }

      final equitySymbol = parseEquitySymbolFromTradingsymbol(tradingsymbol);
      if (equitySymbol == null || equitySymbol.isEmpty) continue;

      _orders.recoverFailedBuy(
        orderId: orderId,
        status: recoveredStatus,
        equitySymbol: equitySymbol,
      );
      if (_orders.hasOrderId(orderId)) continue;

      final entry = _orders.addBuy(
        strike: 0,
        optionType: 'EQ',
        entry: price > 0 ? price : 0,
        sl: 0,
        tgt: 0,
        lots: 1,
        lotsize: 1,
        mock: false,
        equitySymbol: equitySymbol,
        assetType: 'equity',
        brokerOrderId: orderId,
        trigger: 'manual',
        message: 'Synced from mStock order book',
        status: recoveredStatus,
      );
      _orderLogs.add(entry);
    }
  }

  @override
  Future<EquityAnalyzeResponse> fetchEquityAnalyze({List<String>? symbols}) async {
    final list = symbols ?? _watchlist.symbols;
    if (StrategyResearchApiKeys.apiKey.isEmpty) {
      return const EquityAnalyzeResponse(
        stocks: [],
        ranked: [],
        analyzedAt: 0,
        message: 'Set MSTOCK_API_KEY in .env for stock analysis',
      );
    }

    final stocks = <StockSnapshot>[];
    final to = DateTime.now();
    final from = to.subtract(const Duration(days: 2));
    final fromStr =
        '${from.year}-${_pad(from.month)}-${_pad(from.day)} 09:15';
    final toStr = '${to.year}-${_pad(to.month)}-${_pad(to.day)} 15:30';

    for (final sym in list) {
      final token = kEquitySymbolTokens[sym];
      if (token == null) {
        stocks.add(StockSnapshot(
          symbol: sym,
          ltp: 0,
          source: 'local',
          error: 'Unknown symbol token — add to kEquitySymbolTokens',
          analysis: const EquityAnalysis(
            suggestPurchase: false,
            score: 0,
            factors: [],
          ),
        ));
        continue;
      }

      final quote = await _mstock.getHistoricalCandles(
        exchange: 'NSE',
        symbolToken: token,
        interval: 'ONE_MINUTE',
        fromDate: fromStr,
        toDate: toStr,
      );

      double ltp = 0;
      if (quote.isSuccess && quote.candles.isNotEmpty) {
        final last = quote.candles.last;
        if (last.length >= 5 && last[4] is num) {
          ltp = (last[4] as num).toDouble();
        }
      }

      stocks.add(analyzeEquityCandles(
        symbol: sym,
        ltp: ltp,
        candles: quote.candles,
        source: quote.isSuccess ? 'mstock' : 'local',
        error: quote.isSuccess ? '' : quote.message,
      ));
    }

    final ranked = stocks.map(rankStock).toList()
      ..sort((a, b) => b.profitScore.compareTo(a.profitScore));
    final top = ranked.where((r) => r.analysis.suggestPurchase).firstOrNull;

    return EquityAnalyzeResponse(
      stocks: stocks,
      ranked: ranked,
      topPick: top,
      analyzedAt: DateTime.now().millisecondsSinceEpoch,
    );
  }

  @override
  Future<WatchlistResponse> fetchWatchlist() async {
    return WatchlistResponse(symbols: _watchlist.symbols);
  }

  @override
  Future<bool> setAutoTrading(bool enabled) async {
    _orders.autoTrading = enabled;
    return enabled;
  }

  @override
  OrderLogEntry? openPositionForToday() {
    return openPositionForDay(LocalOrderStore.istDayKey());
  }

  @override
  Future<({bool ok, String message, OrderLogEntry? sell})> closeOpenPosition({
    required double exitPrice,
    required String trigger,
    required String status,
  }) async {
    final buy = openPositionForToday();
    if (buy == null) {
      return (ok: false, message: 'No open purchase to sell', sell: null);
    }

    final isLive = buy.mock == false &&
        buy.orderId != null &&
        !buy.orderId!.startsWith('local-');

    if (isLive && NiftyOptimaApiConfig.hasRemoteBackend) {
      await _ensureMstockSession();
      final serverSell = await _remoteApi.placeSell(
        strike: buy.strike,
        optionType: buy.optionType,
        entry: exitPrice,
        sl: buy.sl ?? 0,
        tgt: buy.tgt ?? 0,
        quantity: buy.lots ?? 1,
        trigger: trigger,
        parentBuyId: buy.orderId,
      );
      if (serverSell.ok) {
        final sell = _orders.addSell(
          buy: buy,
          exitPrice: exitPrice,
          trigger: trigger,
          status: status,
          mock: false,
          brokerOrderId: serverSell.orderId,
          message: serverSell.message,
        );
        _orderLogs.add(sell);
        return (ok: true, message: serverSell.message, sell: sell);
      }
      return (
        ok: false,
        message: serverSell.message.isNotEmpty
            ? serverSell.message
            : _liveOrderUnavailableMessage(),
        sell: null,
      );
    }

    if (isLive && await _ensureMstockSession()) {
      final leg = await _scrip.findNiftyOptionInstrument(
        buy.strike,
        buy.optionType,
      );
      if (leg != null) {
        final result = await _ordersApi.placeNiftyOptionOrder(
          leg: leg,
          lots: buy.lots ?? 1,
          entry: exitPrice,
          sl: buy.sl ?? 0,
          tgt: buy.tgt ?? 0,
          transactiontype: 'SELL',
          ordertag: 'niftyoptima-exit',
        );
        if (!result.ok) {
          return (
            ok: false,
            message: _formatOrderError(result.message),
            sell: null,
          );
        }
        final sell = _orders.addSell(
          buy: buy,
          exitPrice: exitPrice,
          trigger: trigger,
          status: status,
          mock: false,
          brokerOrderId: result.orderId,
          message: result.message,
        );
        _orderLogs.add(sell);
        return (ok: true, message: result.message, sell: sell);
      }
    }

    if (isLive) {
      return (
        ok: false,
        message: _liveOrderUnavailableMessage(),
        sell: null,
      );
    }

    final sell = _orders.addSell(
      buy: buy,
      exitPrice: exitPrice,
      trigger: trigger,
      status: status,
    );
    _orderLogs.add(sell);
    return (ok: true, message: 'Sell logged on device', sell: sell);
  }

  @override
  Future<({bool ok, String message, String? orderId})> placeOrder({
    required int strike,
    required String optionType,
    required double entry,
    required double sl,
    required double tgt,
    int quantity = 1,
  }) async {
    final trigger = _orders.autoTrading ? 'signal' : 'manual';

    if (NiftyOptimaApiConfig.hasRemoteBackend) {
      await _ensureMstockSession();
      final server = await _remoteApi.placeOrder(
        strike: strike,
        optionType: optionType,
        entry: entry,
        sl: sl,
        tgt: tgt,
        quantity: quantity,
        trigger: trigger,
      );
      if (server.ok &&
          server.log != null &&
          server.log!.mock != true &&
          server.orderId != null &&
          !server.orderId!.startsWith('MOCK-')) {
        final log = server.log!;
        final row = _orders.addBuy(
          strike: strike,
          optionType: optionType,
          entry: entry,
          sl: sl,
          tgt: tgt,
          lots: log.lots ?? quantity,
          lotsize: log.lotsize ?? defaultNiftyLotSize(),
          mock: log.mock ?? false,
          brokerOrderId: server.orderId,
          trigger: trigger,
          message: server.message,
          status: log.status,
        );
        _orderLogs.add(row);
        return (
          ok: true,
          message: server.message,
          orderId: server.orderId,
        );
      }
      return (
        ok: false,
        message: server.message.isNotEmpty
            ? server.message
            : _liveOrderUnavailableMessage(),
        orderId: null,
      );
    }

    if (await _ensureMstockSession()) {
      final leg = await _scrip.findNiftyOptionInstrument(strike, optionType);
      if (leg == null) {
        return (
          ok: false,
          message:
              'No NIFTY $strike $optionType contract in scrip master for this weekly expiry',
          orderId: null,
        );
      }

      final result = await _ordersApi.placeNiftyOptionOrder(
        leg: leg,
        lots: quantity,
        entry: entry,
        sl: sl,
        tgt: tgt,
      );
      if (!result.ok) {
        return (
          ok: false,
          message: _formatOrderError(result.message),
          orderId: null,
        );
      }

      final row = _orders.addBuy(
        strike: strike,
        optionType: optionType,
        entry: entry,
        sl: sl,
        tgt: tgt,
        lots: quantity,
        lotsize: leg.lotsize,
        mock: false,
        brokerOrderId: result.orderId,
        trigger: trigger,
        message: result.message,
        status: 'submitted',
      );
      _orderLogs.add(row);
      return (
        ok: true,
        message: result.message,
        orderId: result.orderId,
      );
    }

    return (
      ok: false,
      message: _liveOrderUnavailableMessage(),
      orderId: null,
    );
  }

  String _formatOrderError(String message) {
    if (isMstockIpMismatch(message)) {
      return '$message\n${mstockIpWhitelistHint()}\n${NiftyOptimaApiConfig.remoteBackendHint}';
    }
    return message;
  }

  String _liveOrderUnavailableMessage() {
    if (NiftyOptimaApiConfig.hasRemoteBackend) {
      return 'Cannot reach NiftyOptima server at ${NiftyOptimaApiConfig.baseUrl}. '
          'Run cd stat_react && npm run dev on your PC (same Wi‑Fi as the phone).';
    }
    if (StrategyResearchApiKeys.apiKey.isEmpty) {
      return 'Set MSTOCK_API_KEY in .env, log in via SMS OTP, or configure '
          '${NiftyOptimaApiConfig.remoteBackendHint}';
    }
    return 'Cannot place live order — mStock login required (SMS OTP in app) or '
        '${NiftyOptimaApiConfig.remoteBackendHint}';
  }

  String _pad(int n) => n.toString().padLeft(2, '0');

  /// Ensures JWT is loaded (TOTP bootstrap) before broker order APIs.
  Future<bool> _ensureMstockSession() async {
    if (canPlaceMstockOrders) return true;
    if (StrategyResearchApiKeys.apiKey.isEmpty) return false;
    final ok = await MstockJwtManager.instance.bootstrapIfNeeded();
    return ok && canPlaceMstockOrders;
  }
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull {
    final it = iterator;
    if (!it.moveNext()) return null;
    return it.current;
  }
}
