import '../../../../core/errors/result.dart' show Failure, Result, Success;
import '../../domain/entities/backtest_config_model.dart';
import '../../domain/entities/backtest_result_model.dart';
import '../../domain/entities/strategy_rule_model.dart';
import '../../domain/errors/strategy_research_error.dart';
import '../../domain/repositories/i_strategy_research_repository.dart';
import '../sources/remote/strategy_research_remote_service.dart';

/// Implements [IStrategyResearchRepository]; maps DTOs to domain.
class StrategyResearchRepositoryImpl implements IStrategyResearchRepository {
  StrategyResearchRepositoryImpl(this._remote);

  final StrategyResearchRemoteService _remote;

  @override
  Future<Result<StrategyRuleModel, StrategyResearchError>> getStrategyRules() {
    return _remote.getStrategyRules();
  }

  @override
  Future<Result<BacktestResultModel, StrategyResearchError>> runBacktest(
    BacktestConfigModel config,
  ) async {
    final result = await _remote.runBacktest(config);
    return result.when(
      success: (dto) => Success(dto.toDomain()),
      failure: (e) => Failure(e),
    );
  }

  @override
  Future<({bool ok, String message})> checkLiveDataApi() =>
      _remote.checkLiveDataApi();

  @override
  Future<({double? ltp, bool fromLastCandle, String error})> getLiveNiftyLtp() =>
      _remote.getLiveNiftyLtp();

  @override
  Future<Result<List<BacktestResultModel>, StrategyResearchError>>
      evaluateProfitableStrategies() {
    return _remote.evaluateProfitableStrategies();
  }

  @override
  Future<Result<BacktestResultModel?, StrategyResearchError>>
      evaluateSignaledStrategy() {
    return _remote.evaluateSignaledStrategy();
  }
}
