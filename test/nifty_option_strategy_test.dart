import 'package:flutter_test/flutter_test.dart';
import 'package:strategy/strategy_research/domain/entities/backtest_config_model.dart';
import 'package:strategy/strategy_research/domain/entities/trade_signal_score.dart';
import 'package:strategy/strategy_research/domain/nifty_option_strategy_engine.dart';
import 'package:strategy/strategy_research/domain/option_recommendation_engine.dart';
import 'package:strategy/strategy_research/domain/entities/backtest_result_model.dart';
import 'package:strategy/strategy_research/domain/multi_strategy_evaluator.dart';
import 'package:strategy/strategy_research/domain/strategy_variant_catalog.dart';

void main() {
  const config = BacktestConfigModel.optimal;

  test('bullish signals score CALL >= 4', () {
    const signals = MarketSignals(
      price: 24600,
      emaFast: 24550,
      emaSlow: 24400,
      rsi: 62,
      priorDayHigh: 24500,
      priorDayLow: 24300,
      volume: 1200,
      avgVolume20: 800,
      pcr: 1.15,
      longBuildUp: true,
      vixRising: false,
    );
    final score = NiftyOptionStrategyEngine.scoreSignals(signals, config);
    expect(score.callScore, greaterThanOrEqualTo(4));
    expect(score.callMeetsThreshold, isTrue);
  });

  test('recommend picks CALL when call backtest and score stronger', () {
    const liveScore = TradeSignalScore(
      callScore: 5,
      putScore: 2,
      maxScore: 5,
      callFactors: [],
      putFactors: [],
      config: config,
    );
    const signals = MarketSignals(price: 24600, pcr: 1.1);
    const callMetrics = OptionStrategyMetrics(
      netPnlPercent: 6,
      winRate: 58,
      riskRewardRatio: 2.2,
      totalTrades: 40,
      winningTrades: 23,
    );
    const putMetrics = OptionStrategyMetrics(
      netPnlPercent: 2,
      winRate: 50,
      riskRewardRatio: 1.5,
      totalTrades: 10,
      winningTrades: 5,
    );
    final rec = NiftyOptionStrategyEngine.recommend(
      liveScore: liveScore,
      signals: signals,
      callMetrics: callMetrics,
      putMetrics: putMetrics,
      config: config,
    );
    expect(rec, OptionRecommendation.call);
  });

  test('pickBestWithLiveSignal returns one setup when signal is live', () {
    const signals = MarketSignals(
      price: 24600,
      emaFast: 24550,
      emaSlow: 24400,
      rsi: 62,
      priorDayHigh: 24500,
      priorDayLow: 24300,
      volume: 1200,
      avgVolume20: 800,
      pcr: 1.15,
      longBuildUp: true,
    );
    final variantMetrics = StrategyVariantCatalog.all
        .map(
          (_) => (
            call: const OptionStrategyMetrics(
              netPnlPercent: 6,
              winRate: 58,
              riskRewardRatio: 2.2,
              totalTrades: 40,
              winningTrades: 23,
            ),
            put: const OptionStrategyMetrics(
              netPnlPercent: 4,
              winRate: 54,
              riskRewardRatio: 2.0,
              totalTrades: 35,
              winningTrades: 19,
            ),
          ),
        )
        .toList();

    final best = MultiStrategyEvaluator.pickBestWithLiveSignal(
      signals: signals,
      variantMetrics: variantMetrics,
      variants: StrategyVariantCatalog.all,
    );

    expect(best, isNotNull);
    expect(best!.recommendation, OptionRecommendation.call);
  });

  test('pickBestWithLiveSignal returns null without live signal', () {
    const signals = MarketSignals(price: 24500, pcr: 0.5, vixRising: true);
    final variantMetrics = StrategyVariantCatalog.all
        .map(
          (_) => (
            call: const OptionStrategyMetrics(
              netPnlPercent: 6,
              winRate: 58,
              riskRewardRatio: 2.2,
              totalTrades: 40,
              winningTrades: 23,
            ),
            put: const OptionStrategyMetrics(
              netPnlPercent: 4,
              winRate: 54,
              riskRewardRatio: 2.0,
              totalTrades: 35,
              winningTrades: 19,
            ),
          ),
        )
        .toList();

    final best = MultiStrategyEvaluator.pickBestWithLiveSignal(
      signals: signals,
      variantMetrics: variantMetrics,
      variants: StrategyVariantCatalog.all,
    );

    expect(best, isNull);
  });

  test('multi evaluator returns multiple profitable variants', () {
    const signals = MarketSignals(
      price: 24600,
      emaFast: 24550,
      emaSlow: 24400,
      rsi: 62,
      priorDayHigh: 24500,
      priorDayLow: 24300,
      volume: 1200,
      avgVolume20: 800,
      pcr: 1.15,
      longBuildUp: true,
    );
    final variantMetrics = StrategyVariantCatalog.all
        .map(
          (_) => (
            call: const OptionStrategyMetrics(
              netPnlPercent: 6,
              winRate: 58,
              riskRewardRatio: 2.2,
              totalTrades: 40,
              winningTrades: 23,
            ),
            put: const OptionStrategyMetrics(
              netPnlPercent: 4,
              winRate: 54,
              riskRewardRatio: 2.0,
              totalTrades: 35,
              winningTrades: 19,
            ),
          ),
        )
        .toList();

    final candidates = MultiStrategyEvaluator.evaluate(
      signals: signals,
      variantMetrics: variantMetrics,
      variants: StrategyVariantCatalog.all,
    );

    expect(candidates.length, greaterThan(1));
    expect(candidates.first.compositeScore, greaterThanOrEqualTo(candidates.last.compositeScore));
  });

  test('isTradeable requires min R:R 2', () {
    const weak = OptionStrategyMetrics(
      netPnlPercent: 5,
      winRate: 55,
      riskRewardRatio: 1.5,
      totalTrades: 20,
    );
    expect(OptionRecommendationEngine.isTradeable(weak, config: config), isFalse);
  });
}
