import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/strategy_research_repository_impl.dart';
import '../../data/sources/remote/strategy_research_remote_service.dart';
import '../../domain/repositories/i_strategy_research_repository.dart';
import '../state/strategy_research_notifier.dart';
import '../state/strategy_research_state.dart';

final strategyResearchRemoteServiceProvider =
    Provider<StrategyResearchRemoteService>((ref) {
  return StrategyResearchRemoteService();
});

final strategyResearchRepositoryProvider =
    Provider<IStrategyResearchRepository>((ref) {
  final remote = ref.watch(strategyResearchRemoteServiceProvider);
  return StrategyResearchRepositoryImpl(remote);
});

final strategyResearchNotifierProvider =
    StateNotifierProvider<StrategyResearchNotifier, StrategyResearchState>(
  (ref) {
    final repository = ref.watch(strategyResearchRepositoryProvider);
    return StrategyResearchNotifier(repository);
  },
);
