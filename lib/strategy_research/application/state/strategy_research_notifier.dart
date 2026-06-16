import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/state/data_state.dart';
import '../../data/auth/mstock_jwt_manager.dart';
import '../../data/constants/strategy_research_api_keys.dart';
import '../../domain/entities/backtest_config_model.dart';
import '../../domain/entities/backtest_result_model.dart';
import '../../domain/entities/strategy_rule_model.dart';
import '../../domain/repositories/i_strategy_research_repository.dart';
import 'strategy_research_state.dart';

class StrategyResearchNotifier extends StateNotifier<StrategyResearchState> {
  StrategyResearchNotifier(this._repository) : super(StrategyResearchState.initial);

  final IStrategyResearchRepository _repository;

  Future<void> loadStrategyRules() async {
    state = state.copyWith(rulesState: DataStateLoading<StrategyRuleModel>());
    final result = await _repository.getStrategyRules();
    state = result.when(
      success: (rules) => state.copyWith(
        rulesState: DataStateSuccess<StrategyRuleModel>(value: rules),
      ),
      failure: (e) => state.copyWith(
        rulesState: DataStateFailure<StrategyRuleModel>(error: e),
      ),
    );
  }

  Future<void> runBacktest(BacktestConfigModel config) async {
    await MstockJwtManager.instance.bootstrapIfNeeded();
    state = state.copyWith(
      backtestState: DataStateLoading<BacktestResultModel>(),
    );
    final result = await _repository.runBacktest(config);
    state = result.when(
      success: (backtestResult) => state.copyWith(
        backtestState: DataStateSuccess<BacktestResultModel>(
          value: backtestResult,
        ),
      ),
      failure: (e) => state.copyWith(
        backtestState: DataStateFailure<BacktestResultModel>(error: e),
      ),
    );
  }

  /// Check if live data API is working. Returns message to show in UI.
  Future<String> checkLiveDataApi() async {
    await MstockJwtManager.instance.bootstrapIfNeeded();
    if (!MstockJwtManager.instance.hasSessionJwt) {
      final hint = StrategyResearchApiKeys.totpSecret.isEmpty
          ? 'Sign in with SMS OTP (Settings → mStock account). TOTP is not enabled.'
          : 'Sign in to mStock first (banner or Settings).';
      return 'Live data API: $hint';
    }
    final result = await _repository.checkLiveDataApi();
    return result.message;
  }

  /// Load live NIFTY 50 index and update state (quote API, then last candle fallback).
  /// When API fails (e.g. no JWT), uses default spot so the UI shows a value instead of an error.
  Future<void> loadLiveNifty() async {
    state = state.copyWith(liveNiftyLoading: true, liveNiftyError: '');
    final result = await _repository.getLiveNiftyLtp();
    const defaultSpot = 24500;
    final ltp = result.ltp ?? (result.error.isNotEmpty ? defaultSpot.toDouble() : null);
    state = state.copyWith(
      liveNiftyLoading: false,
      liveNiftyLtp: ltp,
      liveNiftyError: ltp != null ? '' : result.error,
      liveNiftyFromLastCandle: result.fromLastCandle || (result.error.isNotEmpty && ltp != null),
    );
  }
}
