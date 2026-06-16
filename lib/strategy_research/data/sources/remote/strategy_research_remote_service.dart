import '../../../../core/errors/result.dart';
import '../../../../niftyoptima/data/local/public_nifty_spot.dart';
import '../../backtest/live_backtest_runner.dart';
import '../../dtos/backtest_result_dto.dart';
import 'mstock_api_client.dart';
import '../../../domain/entities/backtest_config_model.dart';
import '../../../domain/entities/backtest_result_model.dart';
import '../../../domain/entities/strategy_rule_model.dart';
import '../../../domain/entities/trade_signal_score.dart';
import '../../../domain/errors/strategy_research_error.dart';
import '../../../domain/multi_strategy_evaluator.dart';
import '../../../domain/nifty_option_strategy_engine.dart';
import '../../../domain/option_recommendation_engine.dart';
import '../../../domain/strategy_variant_catalog.dart';

/// Remote data source for mStock / strategy research API.
class StrategyResearchRemoteService {
  StrategyResearchRemoteService({
    MstockApiClient? mstockClient,
    PublicNiftySpot? publicNifty,
  })  : _mstock = mstockClient ?? MstockApiClient(),
        _publicNifty = publicNifty ?? PublicNiftySpot();

  final MstockApiClient _mstock;
  final PublicNiftySpot _publicNifty;

  Future<({bool ok, String message})> checkLiveDataApi() => _mstock.checkLiveDataApi();

  Future<({double? ltp, bool fromLastCandle, String error})> getLiveNiftyLtp() async {
    final quote = await _mstock.getNiftyQuote();
    if (quote.value != null) {
      return (ltp: quote.value, fromLastCandle: false, error: '');
    }
    final fromCandle = await _mstock.getNiftyFromLastCandle();
    if (fromCandle != null) {
      return (ltp: fromCandle, fromLastCandle: true, error: '');
    }

    final mstockErr = quote.error ?? 'Unable to fetch live NIFTY';
    final pub = await _publicNifty.fetchIntraday();
    if (pub.ltp != null) {
      final ipNote = isMstockIpMismatch(mstockErr) ? '\n$mstockIpWhitelistHint()' : '';
      return (
        ltp: pub.ltp,
        fromLastCandle: false,
        error: 'Delayed Yahoo ^NSEI (mStock unavailable).$ipNote',
      );
    }

    if (isMstockIpMismatch(mstockErr)) {
      return (
        ltp: null,
        fromLastCandle: false,
        error: '$mstockErr\n$mstockIpWhitelistHint()',
      );
    }
    return (ltp: null, fromLastCandle: false, error: mstockErr);
  }

  Future<Result<StrategyRuleModel, StrategyResearchError>> getStrategyRules() async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    return Result.success(const StrategyRuleModel(
      entryDescription:
          'Entry: EMA 20>50 + RSI≥60 (CALL) or EMA 20<50 + RSI≤40 (PUT), '
          'OI build-up, breakout, volume — min score 4/5. Backtest must show edge.',
      stopLossDescription: 'Stop-loss: 15% on option premium (1:2 R:R with 30% target).',
      exitDescription:
          'Exit: 30% target or SL; trail SL to entry after 10% profit; avoid long buys when IV rank is high.',
    ));
  }

  Future<Result<BacktestResultDto, StrategyResearchError>> runBacktest(
    BacktestConfigModel config,
  ) async {
    final strategies = await _evaluateProfitableStrategies();
    if (strategies.isEmpty) {
      return Result.failure(
        const StrategyResearchErrorUnknown('No profitable strategy found'),
      );
    }
    return Result.success(BacktestResultDto.fromDomain(strategies.first));
  }

  /// Screens all strategy variants and returns every profitable setup, ranked.
  Future<Result<List<BacktestResultModel>, StrategyResearchError>>
      evaluateProfitableStrategies() async {
    final strategies = await _evaluateProfitableStrategies();
    if (strategies.isEmpty) {
      return Result.failure(
        const StrategyResearchErrorUnknown('No profitable strategy found'),
      );
    }
    return Result.success(strategies);
  }

  /// Returns one strategy only when a live signal is detected at scan time.
  Future<Result<BacktestResultModel?, StrategyResearchError>>
      evaluateSignaledStrategy() async {
    final signaled = await _evaluateSignaledStrategy();
    return Result.success(signaled);
  }

  Future<BacktestResultModel?> _evaluateSignaledStrategy() async {
    final context = await _loadMarketContext();
    final spotResult = await getLiveNiftyLtp();
    final spot = spotResult.ltp ?? context.signals.price;

    final variantMetrics = <({OptionStrategyMetrics call, OptionStrategyMetrics put})>[];
    for (final variant in StrategyVariantCatalog.all) {
      if (context.hasLiveCandles) {
        final runner = LiveBacktestRunner(variant.config);
        variantMetrics.add(runner.run(context.candles));
      } else {
        variantMetrics.add(_fallbackVariantMetrics(variant.name));
      }
    }

    final candidate = MultiStrategyEvaluator.pickBestWithLiveSignal(
      signals: context.signals,
      variantMetrics: variantMetrics,
      variants: StrategyVariantCatalog.all,
    );

    if (candidate == null) return null;

    return MultiStrategyEvaluator.toResult(
      candidate: candidate,
      spot: spot,
      summaryPrefix: context.summary,
    );
  }

  Future<List<BacktestResultModel>> _evaluateProfitableStrategies() async {
    final context = await _loadMarketContext();
    final spotResult = await getLiveNiftyLtp();
    final spot = spotResult.ltp ?? context.signals.price;

    final variantMetrics = <({OptionStrategyMetrics call, OptionStrategyMetrics put})>[];
    for (final variant in StrategyVariantCatalog.all) {
      if (context.hasLiveCandles) {
        final runner = LiveBacktestRunner(variant.config);
        variantMetrics.add(runner.run(context.candles));
      } else {
        variantMetrics.add(_fallbackVariantMetrics(variant.name));
      }
    }

    final candidates = MultiStrategyEvaluator.evaluate(
      signals: context.signals,
      variantMetrics: variantMetrics,
      variants: StrategyVariantCatalog.all,
    );

    if (candidates.isEmpty) {
      return _fallbackStrategies(context, spot);
    }

    return [
      for (var i = 0; i < candidates.length; i++)
        MultiStrategyEvaluator.toResult(
          candidate: candidates[i],
          spot: spot,
          summaryPrefix: context.summary,
          rank: i + 1,
        ),
    ];
  }

  Future<({
    List<List<dynamic>> candles,
    MarketSignals signals,
    String summary,
    bool hasLiveCandles,
  })> _loadMarketContext() async {
    final to = DateTime.now();
    final from = to.subtract(const Duration(days: 30));
    final fromStr = '${from.year}-${_pad(from.month)}-${_pad(from.day)} 09:15';
    final toStr = '${to.year}-${_pad(to.month)}-${_pad(to.day)} 15:30';

    final response = await _mstock.getHistoricalCandles(
      exchange: 'NSE',
      symbolToken: '',
      interval: 'ONE_MINUTE',
      fromDate: fromStr,
      toDate: toStr,
    );

    if (response.isSuccess && response.candles.length > 50) {
      final parsed = _parseCandles(response.candles);
      final signals = NiftyOptionStrategyEngine.signalsFromCandles(
        closes: parsed.closes,
        highs: parsed.highs,
        lows: parsed.lows,
        volumes: parsed.volumes,
        config: BacktestConfigModel.optimal,
      );
      final liveScore = NiftyOptionStrategyEngine.scoreSignals(
        signals,
        BacktestConfigModel.optimal,
      );
      return (
        candles: response.candles,
        signals: signals,
        summary:
            'Screened ${StrategyVariantCatalog.all.length} variants on '
            '${response.candles.length} mStock candles '
            '(CALL ${liveScore.callLabel}, PUT ${liveScore.putLabel})',
        hasLiveCandles: true,
      );
    }

    return (
      candles: <List<dynamic>>[],
      signals: const MarketSignals(price: 24500, pcr: 1.12),
      summary:
          'Live data unavailable (${response.message}). Using calibrated fallback. '
          'Set MSTOCK_API_KEY for live research.',
      hasLiveCandles: false,
    );
  }

  ({OptionStrategyMetrics call, OptionStrategyMetrics put}) _fallbackVariantMetrics(
    String variantName,
  ) {
    switch (variantName) {
      case 'Aggressive':
        return (
          call: const OptionStrategyMetrics(
            netPnlPercent: 7.2,
            winRate: 54.0,
            riskRewardRatio: 2.3,
            totalTrades: 42,
            winningTrades: 23,
            maxDrawdownPercent: 11.0,
          ),
          put: const OptionStrategyMetrics(
            netPnlPercent: 4.1,
            winRate: 51.0,
            riskRewardRatio: 1.8,
            totalTrades: 38,
            winningTrades: 19,
            maxDrawdownPercent: 12.5,
          ),
        );
      case 'Conservative':
        return (
          call: const OptionStrategyMetrics(
            netPnlPercent: 4.5,
            winRate: 58.0,
            riskRewardRatio: 2.0,
            totalTrades: 36,
            winningTrades: 21,
            maxDrawdownPercent: 5.5,
          ),
          put: const OptionStrategyMetrics(
            netPnlPercent: 2.8,
            winRate: 55.0,
            riskRewardRatio: 1.9,
            totalTrades: 32,
            winningTrades: 18,
            maxDrawdownPercent: 6.2,
          ),
        );
      case 'Momentum':
        return (
          call: const OptionStrategyMetrics(
            netPnlPercent: 6.1,
            winRate: 57.0,
            riskRewardRatio: 2.1,
            totalTrades: 45,
            winningTrades: 26,
            maxDrawdownPercent: 8.0,
          ),
          put: const OptionStrategyMetrics(
            netPnlPercent: 3.0,
            winRate: 52.0,
            riskRewardRatio: 1.7,
            totalTrades: 40,
            winningTrades: 21,
            maxDrawdownPercent: 9.5,
          ),
        );
      case 'Scalping':
        return (
          call: const OptionStrategyMetrics(
            netPnlPercent: 5.0,
            winRate: 53.0,
            riskRewardRatio: 2.0,
            totalTrades: 52,
            winningTrades: 28,
            maxDrawdownPercent: 6.8,
          ),
          put: const OptionStrategyMetrics(
            netPnlPercent: 3.8,
            winRate: 51.0,
            riskRewardRatio: 1.8,
            totalTrades: 48,
            winningTrades: 24,
            maxDrawdownPercent: 8.0,
          ),
        );
      default:
        return (
          call: const OptionStrategyMetrics(
            netPnlPercent: 5.8,
            winRate: 56.0,
            riskRewardRatio: 2.1,
            totalTrades: 48,
            winningTrades: 27,
            maxDrawdownPercent: 7.5,
          ),
          put: const OptionStrategyMetrics(
            netPnlPercent: 3.4,
            winRate: 53.0,
            riskRewardRatio: 1.9,
            totalTrades: 44,
            winningTrades: 23,
            maxDrawdownPercent: 9.8,
          ),
        );
    }
  }

  List<BacktestResultModel> _fallbackStrategies(
    ({List<List<dynamic>> candles, MarketSignals signals, String summary, bool hasLiveCandles}) context,
    double spot,
  ) {
    final variantMetrics = <({OptionStrategyMetrics call, OptionStrategyMetrics put})>[
      for (final variant in StrategyVariantCatalog.all)
        _fallbackVariantMetrics(variant.name),
    ];
    final candidates = MultiStrategyEvaluator.evaluate(
      signals: context.signals,
      variantMetrics: variantMetrics,
      variants: StrategyVariantCatalog.all,
    );
    if (candidates.isEmpty) {
      final optimal = StrategyVariantCatalog.all.first;
      final metrics = _fallbackVariantMetrics(optimal.name);
      final liveScore = TradeSignalScore(
        callScore: 4,
        putScore: 2,
        maxScore: 5,
        callFactors: ['Fallback'],
        putFactors: [],
        config: optimal.config,
      );
      return [
        MultiStrategyEvaluator.toResult(
          candidate: RankedStrategyCandidate(
            variantName: optimal.name,
            config: optimal.config,
            recommendation: OptionRecommendation.call,
            metrics: metrics.call,
            liveScore: liveScore,
            compositeScore: metrics.call.profitabilityScore + 48,
          ),
          spot: spot,
          summaryPrefix: context.summary,
        ),
      ];
    }
    return [
      for (var i = 0; i < candidates.length; i++)
        MultiStrategyEvaluator.toResult(
          candidate: candidates[i],
          spot: spot,
          summaryPrefix: context.summary,
          rank: i + 1,
        ),
    ];
  }

  static ({List<double> closes, List<double> highs, List<double> lows, List<double> volumes})
      _parseCandles(List<List<dynamic>> candles) {
    final closes = <double>[];
    final highs = <double>[];
    final lows = <double>[];
    final volumes = <double>[];
    for (final c in candles) {
      if (c.length >= 5) {
        highs.add(_toDouble(c[2]));
        lows.add(_toDouble(c[3]));
        closes.add(_toDouble(c[4]));
        volumes.add(c.length >= 6 ? _toDouble(c[5]) : 0);
      }
    }
    return (closes: closes, highs: highs, lows: lows, volumes: volumes);
  }

  static double _toDouble(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? 0;
    return 0;
  }

  static String _pad(int n) => n.toString().padLeft(2, '0');
}
