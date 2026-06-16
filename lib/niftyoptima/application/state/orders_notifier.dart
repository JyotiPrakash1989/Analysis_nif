import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/constants/niftyoptima_api_config.dart';
import '../../domain/entities/niftyoptima_models.dart';
import '../../domain/repositories/i_niftyoptima_repository.dart';
import 'orders_state.dart';

class OrdersNotifier extends StateNotifier<OrdersState> {
  OrdersNotifier(this._repo) : super(const OrdersState(loading: true)) {
    refresh();
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => refresh());
    _sub = _repo.orderLogs.listen(_appendLog);
  }

  final INiftyOptimaRepository _repo;
  Timer? _poll;
  StreamSubscription<dynamic>? _sub;

  Future<void> refresh() async {
    try {
      final res = await _repo.fetchOrderLog(day: state.day.isEmpty ? null : state.day);
      final emptyAfterSync = res.logs.isEmpty && NiftyOptimaApiConfig.hasRemoteBackend;
      state = state.copyWith(
        day: res.day,
        logs: res.logs,
        loading: false,
        autoTrading: res.autoTrading,
        clearSyncError: true,
        syncError: emptyAfterSync
            ? 'No orders synced from ${NiftyOptimaApiConfig.baseUrl}. '
                'Run cd stat_react && npm start on your PC (same Wi‑Fi).'
            : '',
      );
    } catch (e) {
      state = state.copyWith(
        loading: false,
        syncError: NiftyOptimaApiConfig.hasRemoteBackend
            ? 'Cannot reach ${NiftyOptimaApiConfig.baseUrl}. '
                'Check Wi‑Fi and that stat_react is running.'
            : 'Could not load order log.',
      );
    }
  }

  void _appendLog(OrderLogEntry entry) {
    if (state.day.isNotEmpty && entry.dayKey != state.day) return;
    final logs = [...state.logs, entry];
    logs.sort((a, b) => a.ts.compareTo(b.ts));
    state = state.copyWith(logs: logs);
  }

  @override
  void dispose() {
    _poll?.cancel();
    _sub?.cancel();
    super.dispose();
  }
}
