import 'entities/backtest_config_model.dart';
import 'entities/backtest_result_model.dart';
import 'entities/trade_signal_score.dart';
import 'nifty_option_strategy_engine.dart';
import 'option_recommendation_engine.dart';
import 'strategy_variant_catalog.dart';

/// One profitable CALL or PUT candidate from a variant backtest.
class RankedStrategyCandidate {
  const RankedStrategyCandidate({
    required this.variantName,
    required this.config,
    required this.recommendation,
    required this.metrics,
    required this.liveScore,
    required this.compositeScore,
  });

  final String variantName;
  final BacktestConfigModel config;
  final OptionRecommendation recommendation;
  final OptionStrategyMetrics metrics;
  final TradeSignalScore liveScore;
  final double compositeScore;
}

/// Evaluates all strategy variants and returns every profitable tradeable setup.
class MultiStrategyEvaluator {
  MultiStrategyEvaluator._();

  static const _minCompositeScore = 18.0;
  static const _maxSuggestions = 6;

  static List<RankedStrategyCandidate> evaluate({
    required MarketSignals signals,
    required List<({OptionStrategyMetrics call, OptionStrategyMetrics put})> variantMetrics,
    required List<StrategyVariant> variants,
  }) {
    if (variantMetrics.length != variants.length) {
      throw ArgumentError('variantMetrics and variants must align');
    }

    final candidates = <RankedStrategyCandidate>[];

    for (var i = 0; i < variants.length; i++) {
      final variant = variants[i];
      final config = variant.config;
      final metrics = variantMetrics[i];
      final liveScore = NiftyOptionStrategyEngine.scoreSignals(signals, config);

      for (final side in OptionRecommendation.values) {
        final isCall = side == OptionRecommendation.call;
        final m = isCall ? metrics.call : metrics.put;
        if (!OptionRecommendationEngine.isTradeable(m, config: config)) continue;

        final scoreOk = isCall ? _callScoreOk(liveScore, signals, config) : _putScoreOk(liveScore, signals, config);
        final signalScore = isCall ? liveScore.callScore : liveScore.putScore;
        final composite = NiftyOptionStrategyEngine.compositeScore(
          scoreOk: scoreOk,
          signalScore: signalScore,
          metrics: m,
        );

        if (composite < _minCompositeScore) continue;

        candidates.add(
          RankedStrategyCandidate(
            variantName: variant.name,
            config: config,
            recommendation: side,
            metrics: m,
            liveScore: liveScore,
            compositeScore: composite,
          ),
        );
      }
    }

    candidates.sort((a, b) => b.compositeScore.compareTo(a.compositeScore));
    return candidates.take(_maxSuggestions).toList();
  }

  /// Best profitable setup with a live signal right now (single suggestion).
  static RankedStrategyCandidate? pickBestWithLiveSignal({
    required MarketSignals signals,
    required List<({OptionStrategyMetrics call, OptionStrategyMetrics put})> variantMetrics,
    required List<StrategyVariant> variants,
  }) {
    final candidates = evaluate(
      signals: signals,
      variantMetrics: variantMetrics,
      variants: variants,
    );
    for (final candidate in candidates) {
      final isCall = candidate.recommendation == OptionRecommendation.call;
      final scoreOk = isCall
          ? _callScoreOk(candidate.liveScore, signals, candidate.config)
          : _putScoreOk(candidate.liveScore, signals, candidate.config);
      if (scoreOk) return candidate;
    }
    return null;
  }

  static bool _callScoreOk(
    TradeSignalScore liveScore,
    MarketSignals signals,
    BacktestConfigModel config,
  ) {
    var ok = liveScore.callMeetsThreshold;
    if (signals.pcr < config.pcrBearishMax) ok = false;
    if (signals.vixRising) ok = false;
    return ok;
  }

  static bool _putScoreOk(
    TradeSignalScore liveScore,
    MarketSignals signals,
    BacktestConfigModel config,
  ) {
    var ok = liveScore.putMeetsThreshold;
    if (signals.pcr <= config.pcrBearishMax) {
      ok = ok || liveScore.putScore >= config.minTradeScore;
    }
    if (signals.vixRising && liveScore.putScore >= config.minTradeScore - 1) {
      ok = true;
    }
    return ok;
  }

  static BacktestResultModel toResult({
    required RankedStrategyCandidate candidate,
    required double spot,
    required String summaryPrefix,
    int rank = 1,
  }) {
    final isCall = candidate.recommendation == OptionRecommendation.call;
    final config = candidate.config;
    final metrics = candidate.metrics;
    final liveScore = candidate.liveScore;

    final strike = NiftyOptionStrategyEngine.strikeForOptionType(
      spot: spot,
      recommendation: candidate.recommendation,
    );

    final riskPct = config.stopLossPercent / 100;
    final rewardPct = config.targetRewardPercent / 100;
    final entry = isCall ? 85.50 : 78.00;
    final sl = entry * (1 - riskPct);
    final target = entry * (1 + rewardPct);

    return BacktestResultModel(
      winRate: metrics.winRate,
      totalTrades: metrics.totalTrades,
      winningTrades: metrics.winningTrades,
      maxDrawdownPercent: metrics.maxDrawdownPercent,
      riskRewardRatio: metrics.riskRewardRatio,
      netPnl: metrics.netPnlPercent,
      summary: '$summaryPrefix • ${candidate.variantName} (#$rank)',
      optionRecommendation: candidate.recommendation,
      recommendedStrikePrice: strike,
      recommendedOptionPrice: entry,
      optionEntryPrice: entry,
      optionExitPrice: target,
      optionStopLoss: sl,
      recommendedExpiryDate: DateTime.now().add(const Duration(days: 7)),
      callSignalScore: liveScore.callScore,
      putSignalScore: liveScore.putScore,
      signalStrength: liveScore.strengthLabel(
        isCall ? liveScore.callScore : liveScore.putScore,
      ),
      strategyReason: '${candidate.variantName} • '
          '${NiftyOptionStrategyEngine.buildReason(
            recommendation: candidate.recommendation,
            liveScore: liveScore,
            metrics: metrics,
            config: config,
          )}',
      variantName: candidate.variantName,
      profitabilityScore: candidate.compositeScore,
      rank: rank,
    );
  }
}
