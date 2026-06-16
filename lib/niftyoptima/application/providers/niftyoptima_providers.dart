import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/standalone_niftyoptima_repository_impl.dart';
import '../../domain/repositories/i_niftyoptima_repository.dart';
import '../state/history_notifier.dart';
import '../state/history_state.dart';
import '../state/orders_notifier.dart';
import '../state/orders_state.dart';
import '../state/stocks_notifier.dart';
import '../state/stocks_state.dart';

final niftyOptimaRepositoryProvider = Provider<INiftyOptimaRepository>((ref) {
  final repo = StandaloneNiftyOptimaRepositoryImpl();
  ref.onDispose(repo.disconnectSocket);
  return repo;
});

final ordersNotifierProvider =
    StateNotifierProvider<OrdersNotifier, OrdersState>((ref) {
  final repo = ref.watch(niftyOptimaRepositoryProvider);
  final notifier = OrdersNotifier(repo);
  ref.onDispose(notifier.dispose);
  return notifier;
});

final stocksNotifierProvider =
    StateNotifierProvider<StocksNotifier, StocksState>((ref) {
  final repo = ref.watch(niftyOptimaRepositoryProvider);
  final notifier = StocksNotifier(repo);
  ref.onDispose(notifier.dispose);
  return notifier;
});

final historyNotifierProvider =
    StateNotifierProvider<HistoryNotifier, HistoryState>((ref) {
  final repo = ref.watch(niftyOptimaRepositoryProvider);
  final notifier = HistoryNotifier(repo);
  ref.onDispose(notifier.dispose);
  return notifier;
});
