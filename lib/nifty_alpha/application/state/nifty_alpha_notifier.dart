import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../niftyoptima/data/local/breakout_analysis.dart';
import '../../../niftyoptima/data/local/local_market_helpers.dart';
import '../../../niftyoptima/data/local/local_order_store.dart';
import '../../../niftyoptima/domain/entities/niftyoptima_models.dart';
import '../../../niftyoptima/domain/repositories/i_niftyoptima_repository.dart';
import '../../domain/strategy_voice_text.dart';
import '../../domain/models/outlook.dart';
import '../../domain/models/purchase_strategy.dart';
import '../../domain/models/strike_suggestion.dart';
import '../../domain/smart_strike_service.dart';
import '../providers/trading_settings_provider.dart';
import '../services/strategy_voice_service.dart';
import 'nifty_alpha_state.dart';

final smartStrikeService = SmartStrikeService();

const _strategyAnalysisKey = 'niftyoptima-strategy-analysis';

typedef TradingSettingsReader = TradingSettings Function();

/// Notifier backed by on-device mStock API + local strategy engine.
class NiftyAlphaNotifier extends StateNotifier<NiftyAlphaState> {
  NiftyAlphaNotifier(
    this._repo, {
    required StrategyVoiceService voice,
    required TradingSettingsReader readSettings,
  })  : _voice = voice,
        _readSettings = readSettings,
        super(const NiftyAlphaState()) {
    _refreshSuggestion();
    _subscriptions.add(_repo.socketConnected.listen(_onSocketConnected));
    _subscriptions.add(_repo.ticks.listen(_onTick));
    _subscriptions.add(_repo.signals.listen(_onSignal));
    _subscriptions.add(_repo.orderLogs.listen(_onOrderLog));
    loadLiveNifty();
    _spotPollTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      loadLiveNifty();
    });
    _loadAnalysisSetting();
  }

  final INiftyOptimaRepository _repo;
  final StrategyVoiceService _voice;
  final TradingSettingsReader _readSettings;
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  Timer? _spotPollTimer;
  String? _lastSignalKey;
  String? _lastHoldKey;
  bool _exitInFlight = false;
  List<OptionChainRow> _lastOptionChain = const [];

  TradingSettings get _settings => _readSettings();

  void _onSocketConnected(bool connected) {
    state = state.copyWith(socketConnected: connected);
  }

  void _onOrderLog(OrderLogEntry entry) {
    if (!_settings.voiceEnabled) return;
    unawaited(_voice.speakOrderLog(entry));
  }

  void _onTick(TickPayload tick) {
    if (!state.signalScanActive) return;
    final dayKey = tick.dailyBestBuy?.dayKey ?? LocalOrderStore.istDayKey();
    _resetIfNewTradingDay(dayKey);
    _lastOptionChain = tick.optionChain;
    final spot = tick.spot;
    final analytics = analyticsFromOptionChain(tick.optionChain);
    final holdMeta = tick.dailyBestBuy?.holdSuggestion;
    var hold = holdMeta?.reason ?? '';
    if (holdMeta?.suppressedScore != null && holdMeta?.suppressedSide != null) {
      hold =
          'Suppressed ${holdMeta!.suppressedSide} setup (${holdMeta.suppressedScore!.round()}% score) — hold for target.';
    }

    final open = _repo.openPositionForToday();
    final hasOpen = open != null;
    state = state.copyWith(
      liveNiftyLtp: spot,
      niftySpot: spot.round(),
      liveNiftyError: tick.indexError ?? '',
      liveNiftyFromLastCandle: tick.indexFromLastCandle ?? false,
      dayChange: tick.dayChange,
      indexSource: tick.indexSource ?? state.indexSource,
      analytics: analytics ?? state.analytics,
      signalDayKey: dayKey,
      signalsToday: tick.dailyBestBuy?.signalsToday ?? state.signalsToday,
      ceScore: tick.dailyBestBuy?.ceScore ?? state.ceScore,
      peScore: tick.dailyBestBuy?.peScore ?? state.peScore,
      liveRsi: tick.rsi ?? state.liveRsi,
      strategyRules: tick.strategyRules ?? state.strategyRules,
      holdSuggestion: hold,
      clearHoldSuggestion: hold.isEmpty,
      lastSignalCheckAt: DateTime.now(),
    );
    _applyOpenPosition(open);
    _refreshSuggestion();

    if (hasOpen) {
      _monitorPositionLtp(tick);
    }

    if (holdMeta != null && _settings.voiceEnabled) {
      final holdKey = holdSuggestionAlertKey(holdMeta);
      if (holdKey != _lastHoldKey) {
        _lastHoldKey = holdKey;
        unawaited(_voice.speakHold(holdMeta));
      }
    }

    final blocked = tick.dailyBestBuy?.suppressedByPosition == true || hasOpen;
    if (blocked) return;
    final sig = tick.dailyBestBuy?.signal;
    if (sig != null) _applySignal(sig);
  }

  void _monitorPositionLtp(TickPayload tick) {
    final strategy = state.purchaseStrategy;
    if (strategy == null) return;

    final ltp = _optionLtp(
      tick.optionChain,
      strategy.strikePrice,
      strategy.optionType,
    );
    if (ltp == null) return;

    state = state.copyWith(currentPrice: ltp);
    if (_exitInFlight) return;

    if (ltp >= strategy.bookProfit) {
      _exitInFlight = true;
      unawaited(_exitPosition(
        ltp: ltp,
        kind: 'target',
        level: strategy.bookProfit,
      ));
    } else if (ltp <= strategy.stopLoss) {
      _exitInFlight = true;
      unawaited(_exitPosition(
        ltp: ltp,
        kind: 'stoploss',
        level: strategy.stopLoss,
      ));
    }
  }

  double? _optionLtp(List<OptionChainRow> chain, int strike, String optionType) {
    for (final row in chain) {
      if (row.strike != strike) continue;
      return optionType == 'CE' ? row.ce.ltp : row.pe.ltp;
    }
    return null;
  }

  void _applyOpenPosition(OrderLogEntry? open) {
    if (open == null) {
      if (!state.hasPosition) return;
      state = state.copyWith(
        hasPosition: false,
        clearOpenOrderId: true,
        entryPrice: null,
        currentPrice: null,
        trailingSlActive: false,
        profitPercent: null,
      );
      return;
    }
    state = state.copyWith(
      hasPosition: true,
      openOrderId: open.orderId ?? open.id,
      entryPrice: open.entry,
      currentPrice: state.currentPrice ?? open.entry,
    );
  }

  Future<void> _exitPosition({
    required double ltp,
    required String kind,
    required double level,
  }) async {
    final strategy = state.purchaseStrategy;
    if (strategy == null) {
      _exitInFlight = false;
      return;
    }

    if (_settings.voiceEnabled) {
      await _voice.speakPositionExit(
        strike: strategy.strikePrice,
        optionType: strategy.optionType,
        kind: kind,
        ltp: ltp,
        level: level,
        orderId: state.openOrderId ?? 'local-position',
      );
    }

    final trigger = kind == 'target' ? 'target' : 'stoploss';
    final status = kind == 'target' ? 'target_exit' : 'stoploss_exit';
    await _repo.closeOpenPosition(
      exitPrice: ltp,
      trigger: trigger,
      status: status,
    );
    exitAll();
    _exitInFlight = false;
  }

  void _onSignal(SignalPayload sig) {
    if (!state.signalScanActive || state.hasPosition) return;
    final sigDay = LocalOrderStore.istDayKey(
      DateTime.fromMillisecondsSinceEpoch(sig.ts),
    );
    if (sigDay != LocalOrderStore.istDayKey()) return;
    _applySignal(sig);
  }

  Future<void> _loadAnalysisSetting() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_strategyAnalysisKey);
    final on = v == null || (v != '0' && v != 'false');
    await setStrategyAnalysisEnabled(on, persist: false);
  }

  Future<void> setStrategyAnalysisEnabled(bool on, {bool persist = true}) async {
    state = state.copyWith(signalScanActive: on);
    if (persist) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_strategyAnalysisKey, on ? '1' : '0');
    }
    if (on) {
      _repo.connectSocket();
      await _repo.pollStrategyOnce();
    } else {
      _repo.disconnectSocket();
      state = state.copyWith(socketConnected: false);
    }
  }

  void _resetIfNewTradingDay(String dayKey) {
    if (state.signalDayKey.isEmpty) {
      state = state.copyWith(signalDayKey: dayKey);
      return;
    }
    if (dayKey == state.signalDayKey) return;
    _lastSignalKey = null;
    state = state.copyWith(
      signalDayKey: dayKey,
      clearPurchaseStrategy: true,
      clearStrikeSuggestion: true,
      signalsToday: 0,
      ceScore: 0,
      peScore: 0,
      clearSignalDetectedAt: true,
      clearHoldSuggestion: true,
    );
  }

  void _applySignal(SignalPayload sig) {
    final key = '${sig.ts}-${sig.strike}-${sig.optionType}';
    if (_lastSignalKey == key) return;
    _lastSignalKey = key;
    final strategy = _signalToPurchaseStrategy(sig);
    state = state.copyWith(
      purchaseStrategy: strategy,
      clearPurchaseStrategy: false,
      strategyLoading: false,
      strategyError: '',
      signalDetectedAt: DateTime.now(),
      signalsToday: sig.signalIndex ?? state.signalsToday,
      clearHoldSuggestion: true,
    );
    _refreshSuggestion();

    if (_settings.voiceEnabled) {
      unawaited(_voice.speakSignal(sig, _settings.autoTrading));
    }

    if (_settings.autoTrading && !state.hasPosition) {
      unawaited(buy());
    }
  }

  PurchaseStrategy _signalToPurchaseStrategy(SignalPayload sig) {
    final prefix =
        sig.signalIndex != null ? 'Strategy ${sig.signalIndex} today • ' : '';
    return PurchaseStrategy(
      entryPrice: sig.entry,
      stopLoss: sig.sl,
      bookProfit: sig.tgt,
      strikePrice: sig.strike,
      optionType: sig.optionType,
      niftyLevelAtEntry: state.liveNiftyLtp ?? state.niftySpot.toDouble(),
      reason: '$prefix${sig.rationale}',
      profitabilityScore: sig.confidence,
      signalIndex: sig.signalIndex,
      signalStrength: sig.confidence != null
          ? '${sig.confidence!.toStringAsFixed(0)}% confidence'
          : null,
      expiryDate: nearestNiftyWeeklyExpiry(),
    );
  }

  void _refreshSuggestion() {
    final strategy = state.purchaseStrategy;
    if (strategy == null) {
      state = state.copyWith(clearStrikeSuggestion: true);
      return;
    }
    final outlook =
        strategy.optionType == 'PE' ? Outlook.bearish : Outlook.bullish;
    final base = smartStrikeService.suggest(
      niftySpot: state.effectiveNiftySpot,
      outlook: outlook,
    );
    final suggestion = _enrichStrikeSuggestion(
      outlook: outlook,
      base: base,
      strategy: strategy,
      chain: _lastOptionChain,
    );
    state = state.copyWith(outlook: outlook, strikeSuggestion: suggestion);
  }

  StrikeSuggestion _attachExpiry(StrikeSuggestion suggestion) {
    final expiry = suggestion.expiryDate ?? nearestNiftyWeeklyExpiry();
    return StrikeSuggestion(
      outlook: suggestion.outlook,
      suggestedStrike: suggestion.suggestedStrike,
      reason: suggestion.reason,
      deltaHint: suggestion.deltaHint,
      optionType: suggestion.optionType,
      entryPrice: suggestion.entryPrice,
      stopLoss: suggestion.stopLoss,
      target: suggestion.target,
      risk: suggestion.risk,
      expiryDate: expiry,
    );
  }

  StrikeSuggestion _enrichStrikeSuggestion({
    required Outlook outlook,
    required StrikeSuggestion base,
    required PurchaseStrategy? strategy,
    required List<OptionChainRow> chain,
  }) {
    if (strategy != null) {
      return _attachExpiry(StrikeSuggestion(
        outlook: outlook,
        suggestedStrike: strategy.strikePrice,
        reason: strategy.reason ?? base.reason,
        deltaHint: base.deltaHint,
        optionType: strategy.optionType,
        entryPrice: strategy.entryPrice,
        stopLoss: strategy.stopLoss,
        target: strategy.bookProfit,
        risk: strategy.entryPrice - strategy.stopLoss,
        expiryDate: strategy.expiryDate,
      ));
    }

    final optionType = base.optionType;
    if (optionType == null) return _attachExpiry(base);

    final spot = state.effectiveNiftySpot.toDouble();
    // Match daily best-buy / breakout signal: ATM strike + chain LTP.
    final strike = atmStrikeFromSpot(spot);
    final entry = optionLegLtp(
      spot: spot,
      strike: strike,
      optionType: optionType,
      chain: chain,
    );
    if (!entry.isFinite || entry <= 0) return _attachExpiry(base);

    final levels = calculateLevels(entry, entry * 0.9);
    return _attachExpiry(StrikeSuggestion(
      outlook: outlook,
      suggestedStrike: strike,
      reason: base.reason,
      deltaHint: base.deltaHint,
      optionType: optionType,
      entryPrice: entry,
      stopLoss: levels.sl,
      target: levels.tgt,
      risk: levels.risk,
    ));
  }

  Future<void> loadLiveNifty() async {
    state = state.copyWith(liveNiftyLoading: true);
    final rest = await _repo.fetchNiftySpot();
    _lastOptionChain = rest.optionChain;
    final spot = rest.spot;
    final analytics = analyticsFromOptionChain(rest.optionChain);
    Map<String, StrategyRuleLeg?>? rules;
    double? rsi = rest.rsi;
    if (spot != null && rest.bars1m.isNotEmpty) {
      final breakout = evaluateBreakoutContext(rest.bars1m, spot);
      rules = {
        'ce': breakout.rules.ce,
        'pe': breakout.rules.pe,
      };
      rsi = breakout.rsi ?? rsi;
    }
    state = state.copyWith(
      liveNiftyLoading: false,
      liveNiftyLtp: spot,
      niftySpot: spot != null ? spot.round() : state.niftySpot,
      liveNiftyError: rest.indexError,
      liveNiftyFromLastCandle: rest.indexFromLastCandle,
      dayChange: rest.dayChange,
      clearDayChange: spot == null,
      indexSource: rest.indexSource,
      analytics: analytics ?? state.analytics,
      liveRsi: rsi,
      strategyRules: rules ?? state.strategyRules,
    );
    _refreshSuggestion();
  }

  Future<void> loadPurchaseStrategy() async {
    state = state.copyWith(strategyLoading: true, strategyError: '');
    await loadLiveNifty();
    if (!state.signalScanActive) {
      await _repo.pollStrategyOnce();
    }
    state = state.copyWith(
      strategyLoading: false,
      strategyError: state.purchaseStrategy == null
          ? _awaitingSignalMessage()
          : '',
    );
  }

  void setNiftySpot(int spot) {
    state = state.copyWith(niftySpot: spot);
    _refreshSuggestion();
  }

  PurchaseStrategy? _strategyFromSuggestion(StrikeSuggestion? suggestion) {
    if (suggestion == null ||
        !suggestion.hasTradeLevels ||
        suggestion.optionType == null) {
      return null;
    }
    return PurchaseStrategy(
      entryPrice: suggestion.entryPrice!,
      stopLoss: suggestion.stopLoss!,
      bookProfit: suggestion.target!,
      strikePrice: suggestion.suggestedStrike,
      optionType: suggestion.optionType!,
      niftyLevelAtEntry: state.liveNiftyLtp ?? state.niftySpot.toDouble(),
      reason: suggestion.reason,
      expiryDate: suggestion.expiryDate ?? nearestNiftyWeeklyExpiry(),
    );
  }

  PurchaseStrategy? _resolveBuyStrategy() {
    return state.purchaseStrategy ?? _strategyFromSuggestion(state.strikeSuggestion);
  }

  Future<void> buy() async {
    final strategy = _resolveBuyStrategy();
    if (strategy == null || state.hasPosition) return;
    if (state.purchaseStrategy == null) {
      state = state.copyWith(purchaseStrategy: strategy);
    }
    state = state.copyWith(strategyLoading: true);
    final result = await _repo.placeOrder(
      strike: strategy.strikePrice,
      optionType: strategy.optionType,
      entry: strategy.entryPrice,
      sl: strategy.stopLoss,
      tgt: strategy.bookProfit,
    );
    if (result.ok) {
      _applyOpenPosition(_repo.openPositionForToday());
      state = state.copyWith(
        strategyLoading: false,
        strategyError: '',
        trailingSlActive: false,
        profitPercent: 0,
        currentPrice: strategy.entryPrice,
      );
    } else {
      state = state.copyWith(
        strategyLoading: false,
        strategyError: result.message.isNotEmpty
            ? result.message
            : 'Order failed',
      );
    }
  }

  Future<void> sell() async {
    if (!state.hasPosition) return;
    state = state.copyWith(strategyLoading: true, strategyError: '');
    final exitPx = state.currentPrice ?? state.entryPrice ?? 0;
    final result = await _repo.closeOpenPosition(
      exitPrice: exitPx,
      trigger: 'manual',
      status: 'closed',
    );
    if (result.ok) {
      exitAll();
      state = state.copyWith(strategyLoading: false, strategyError: '');
    } else {
      state = state.copyWith(
        strategyLoading: false,
        strategyError:
            result.message.isNotEmpty ? result.message : 'Sell failed',
      );
    }
  }

  void exitAll() {
    state = state.copyWith(
      hasPosition: false,
      clearOpenOrderId: true,
      entryPrice: null,
      currentPrice: null,
      trailingSlActive: false,
      profitPercent: null,
      clearHoldSuggestion: true,
    );
    _exitInFlight = false;
  }

  void simulatePriceMove(double newPrice) {
    if (!state.hasPosition || state.entryPrice == null) return;
    final entry = state.entryPrice!;
    final pct = ((newPrice - entry) / entry) * 100;
    var trailing = state.trailingSlActive;
    if (!trailing && pct >= 10) trailing = true;
    state = state.copyWith(
      currentPrice: newPrice,
      profitPercent: pct,
      trailingSlActive: trailing,
    );
  }

  void refresh() {
    loadLiveNifty();
    loadPurchaseStrategy();
  }

  String _awaitingSignalMessage() {
    final ce = state.ceScore.round();
    final pe = state.peScore.round();
    if (ce > 0 || pe > 0) {
      return 'Awaiting best setup — CE score $ce · PE score $pe (need ≥92). '
          'Scan runs every ${NiftyAlphaState.signalScanIntervalMinutes} min.';
    }
    return 'No signal yet — breakout scan runs every '
        '${NiftyAlphaState.signalScanIntervalMinutes} min (15m high/low + RSI).';
  }

  @override
  void dispose() {
    _spotPollTimer?.cancel();
    for (final s in _subscriptions) {
      s.cancel();
    }
    super.dispose();
  }
}
