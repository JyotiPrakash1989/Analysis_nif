import 'entities/backtest_config_model.dart';
import 'entities/backtest_result_model.dart';

/// Performance metrics for call or put strategy from backtest (past data).
class OptionStrategyMetrics {
  const OptionStrategyMetrics({
    required this.netPnlPercent,
    required this.winRate,
    required this.riskRewardRatio,
    this.totalTrades = 0,
    this.winningTrades = 0,
    this.maxDrawdownPercent = 0,
  });

  final double netPnlPercent;
  final double winRate;
  final double riskRewardRatio;
  final int totalTrades;
  final int winningTrades;
  final double maxDrawdownPercent;

  /// Composite score: PnL, win rate, R:R; penalise drawdown and thin samples.
  double get profitabilityScore {
    final samplePenalty = totalTrades < 8 ? (8 - totalTrades) * 2.5 : 0.0;
    return netPnlPercent * 0.45 +
        (winRate / 100) * 28 +
        (riskRewardRatio.clamp(0, 3) / 3) * 18 -
        (maxDrawdownPercent.clamp(0, 30) / 30) * 12 -
        samplePenalty;
  }
}

/// Suggests CALL or PUT using backtest edge and [BacktestConfigModel] thresholds.
class OptionRecommendationEngine {
  OptionRecommendationEngine._();

  static bool isTradeable(
    OptionStrategyMetrics metrics, {
    BacktestConfigModel config = BacktestConfigModel.optimal,
  }) =>
      metrics.totalTrades >= config.minBacktestTrades &&
      metrics.winRate >= config.minWinRate &&
      metrics.netPnlPercent > 0 &&
      metrics.riskRewardRatio >= config.minRiskRewardRatio;

  /// Recommends the option (CALL or PUT) that is more profitable based on
  /// [callMetrics] and [putMetrics].
  static OptionRecommendation suggestMoreProfitable({
    required OptionStrategyMetrics callMetrics,
    required OptionStrategyMetrics putMetrics,
    BacktestConfigModel config = BacktestConfigModel.optimal,
  }) {
    final callOk = isTradeable(callMetrics, config: config);
    final putOk = isTradeable(putMetrics, config: config);
    if (callOk && !putOk) return OptionRecommendation.call;
    if (putOk && !callOk) return OptionRecommendation.put;

    final callScore = callMetrics.profitabilityScore;
    final putScore = putMetrics.profitabilityScore;
    const minEdge = 3.0;
    if (callScore >= putScore + minEdge) return OptionRecommendation.call;
    if (putScore >= callScore + minEdge) return OptionRecommendation.put;
    return callScore >= putScore ? OptionRecommendation.call : OptionRecommendation.put;
  }

  static String suggestMoreProfitableAsString({
    required OptionStrategyMetrics callMetrics,
    required OptionStrategyMetrics putMetrics,
    BacktestConfigModel config = BacktestConfigModel.optimal,
  }) {
    final rec = suggestMoreProfitable(
      callMetrics: callMetrics,
      putMetrics: putMetrics,
      config: config,
    );
    return rec == OptionRecommendation.call ? 'CALL' : 'PUT';
  }
}
