import '../../domain/entities/niftyoptima_models.dart';

class OrdersState {
  const OrdersState({
    this.day = '',
    this.logs = const [],
    this.loading = false,
    this.autoTrading = false,
    this.syncError = '',
  });

  final String day;
  final List<OrderLogEntry> logs;
  final bool loading;
  final bool? autoTrading;
  final String syncError;

  OrdersState copyWith({
    String? day,
    List<OrderLogEntry>? logs,
    bool? loading,
    bool? autoTrading,
    String? syncError,
    bool clearSyncError = false,
  }) {
    return OrdersState(
      day: day ?? this.day,
      logs: logs ?? this.logs,
      loading: loading ?? this.loading,
      autoTrading: autoTrading ?? this.autoTrading,
      syncError: clearSyncError ? '' : (syncError ?? this.syncError),
    );
  }
}
