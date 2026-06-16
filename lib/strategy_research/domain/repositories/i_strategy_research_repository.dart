import '../../../../core/errors/result.dart';
import '../entities/backtest_config_model.dart';
import '../entities/backtest_result_model.dart';
import '../entities/strategy_rule_model.dart';
import '../errors/strategy_research_error.dart';

/// Repository contract for strategy research (market data + backtest).
abstract class IStrategyResearchRepository {
  /// Fetch current strategy rules (entry, stop-loss, exit) for display.
  Future<Result<StrategyRuleModel, StrategyResearchError>> getStrategyRules();

  /// Run backtest with given config and return performance metrics.
  Future<Result<BacktestResultModel, StrategyResearchError>> runBacktest(
    BacktestConfigModel config,
  );

  /// Screen all strategy variants; returns every profitable setup ranked by score.
  Future<Result<List<BacktestResultModel>, StrategyResearchError>>
      evaluateProfitableStrategies();

  /// Returns one strategy when a live signal is present at scan time, else null.
  Future<Result<BacktestResultModel?, StrategyResearchError>>
      evaluateSignaledStrategy();

  /// Check if live data API (mStock) is working. Returns (ok, message).
  Future<({bool ok, String message})> checkLiveDataApi();

  /// Fetch live NIFTY 50 index. Tries quote then last candle. Returns (ltp, fromLastCandle, error).
  Future<({double? ltp, bool fromLastCandle, String error})> getLiveNiftyLtp();
}
