import '../entities/niftyoptima_models.dart';

abstract class INiftyOptimaRepository {
  Future<NiftySpotRest> fetchNiftySpot();
  Future<NiftyHistoryRest> fetchNiftyHistory({int tradingDays = 5});
  Future<OrderLogResponse> fetchOrderLog({String? day});
  Future<EquityAnalyzeResponse> fetchEquityAnalyze({List<String>? symbols});
  Future<WatchlistResponse> fetchWatchlist();
  Future<bool> setAutoTrading(bool enabled);
  Future<({bool ok, String message, String? orderId})> placeOrder({
    required int strike,
    required String optionType,
    required double entry,
    required double sl,
    required double tgt,
    int quantity = 1,
  });

  /// Closes today's open buy with a sell log (manual, target, or stop-loss).
  Future<({bool ok, String message, OrderLogEntry? sell})> closeOpenPosition({
    required double exitPrice,
    required String trigger,
    required String status,
  });

  OrderLogEntry? openPositionForToday();

  Stream<bool> get socketConnected;
  Stream<TickPayload> get ticks;
  Stream<SignalPayload> get signals;
  Stream<OrderLogEntry> get orderLogs;

  void connectSocket();
  void disconnectSocket();

  /// Run one profitable-strategy scan (15m breakout + CE/PE scores).
  Future<void> pollStrategyOnce();
}
