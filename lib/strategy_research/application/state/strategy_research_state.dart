import '../../../../core/state/data_state.dart';
import '../../domain/entities/backtest_result_model.dart';
import '../../domain/entities/strategy_rule_model.dart';

/// Immutable state for strategy research feature.
class StrategyResearchState {
  const StrategyResearchState({
    this.rulesState = _initialRules,
    this.backtestState = _initialBacktest,
    this.isRefreshing = false,
    this.liveNiftyLtp,
    this.liveNiftyLoading = false,
    this.liveNiftyError = '',
    this.liveNiftyFromLastCandle = false,
  });

  static const DataState<StrategyRuleModel> _initialRules =
      DataStateInitial<StrategyRuleModel>();
  static const DataState<BacktestResultModel> _initialBacktest =
      DataStateInitial<BacktestResultModel>();

  final DataState<StrategyRuleModel> rulesState;
  final DataState<BacktestResultModel> backtestState;
  final bool isRefreshing;
  final double? liveNiftyLtp;
  final bool liveNiftyLoading;
  /// Non-empty when live NIFTY fetch failed.
  final String liveNiftyError;
  /// True when value is from last historical candle (quote API failed).
  final bool liveNiftyFromLastCandle;

  bool get rulesLoading => rulesState.isLoading;
  bool get rulesHasError => rulesState.hasFailure;
  bool get rulesSuccess => rulesState.isSuccess;
  StrategyRuleModel? get rules => rulesState.valueOrNull;

  bool get backtestLoading => backtestState.isLoading;
  bool get backtestHasError => backtestState.hasFailure;
  bool get backtestSuccess => backtestState.isSuccess;
  BacktestResultModel? get backtestResult => backtestState.valueOrNull;

  StrategyResearchState copyWith({
    DataState<StrategyRuleModel>? rulesState,
    DataState<BacktestResultModel>? backtestState,
    bool? isRefreshing,
    double? liveNiftyLtp,
    bool? liveNiftyLoading,
    String? liveNiftyError,
    bool? liveNiftyFromLastCandle,
  }) {
    return StrategyResearchState(
      rulesState: rulesState ?? this.rulesState,
      backtestState: backtestState ?? this.backtestState,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      liveNiftyLtp: liveNiftyLtp ?? this.liveNiftyLtp,
      liveNiftyLoading: liveNiftyLoading ?? this.liveNiftyLoading,
      liveNiftyError: liveNiftyError ?? this.liveNiftyError,
      liveNiftyFromLastCandle: liveNiftyFromLastCandle ?? this.liveNiftyFromLastCandle,
    );
  }

  static const StrategyResearchState initial = StrategyResearchState();
}
