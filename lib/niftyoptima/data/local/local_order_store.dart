import '../../domain/entities/niftyoptima_models.dart';

/// In-memory order log (persists for app session; no server required).
class LocalOrderStore {
  LocalOrderStore._();
  static final instance = LocalOrderStore._();

  final List<OrderLogEntry> _logs = [];
  bool autoTrading = false;
  int _idSeq = 1;

  static String istDayKey([DateTime? now]) {
    final n = now ?? DateTime.now();
    final ist = n.toUtc().add(const Duration(hours: 5, minutes: 30));
    return '${ist.year.toString().padLeft(4, '0')}-'
        '${ist.month.toString().padLeft(2, '0')}-'
        '${ist.day.toString().padLeft(2, '0')}';
  }

  List<OrderLogEntry> logsForDay(String day) {
    if (day.isEmpty) return List.unmodifiable(_logs);
    return _logs.where((l) => l.dayKey == day).toList(growable: false);
  }

  OrderLogEntry addBuy({
    required int strike,
    required String optionType,
    required double entry,
    required double sl,
    required double tgt,
    int lots = 1,
    int lotsize = 75,
    bool mock = true,
    String? equitySymbol,
    String assetType = 'option',
    String? brokerOrderId,
    String trigger = 'signal',
    String? message,
    String? status,
  }) {
    final now = DateTime.now();
    final dayKey = istDayKey(now);
    final orderId = brokerOrderId ?? 'local-${_idSeq++}';
    final entry_ = OrderLogEntry(
      id: orderId,
      ts: now.millisecondsSinceEpoch,
      dayKey: dayKey,
      action: 'BUY',
      mode: autoTrading ? 'auto' : 'manual',
      trigger: trigger,
      strike: strike,
      optionType: optionType,
      status: status ?? (mock ? 'simulated' : 'submitted'),
      assetType: assetType == 'equity' ? 'equity' : null,
      equitySymbol: equitySymbol,
      lots: lots,
      units: lots * lotsize,
      lotsize: lotsize,
      entry: entry,
      sl: sl,
      tgt: tgt,
      ltp: entry,
      orderId: orderId,
      mock: mock,
      message: message ?? (mock ? 'Simulated on-device order' : 'Live mStock order'),
    );
    _logs.add(entry_);
    return entry_;
  }

  void upsertBuy(OrderLogEntry entry) => upsert(entry);

  void upsert(OrderLogEntry entry) {
    final idx = _logs.indexWhere(
      (l) =>
          (entry.orderId != null &&
              (l.orderId == entry.orderId || l.id == entry.orderId)) ||
          l.id == entry.id,
    );
    if (idx >= 0) {
      final old = _logs[idx];
      if (_shouldKeepExistingStatus(old.status, entry.status)) {
        _logs[idx] = OrderLogEntry(
          id: entry.id.isNotEmpty ? entry.id : old.id,
          ts: entry.ts > 0 ? entry.ts : old.ts,
          dayKey: entry.dayKey.isNotEmpty ? entry.dayKey : old.dayKey,
          action: entry.action.isNotEmpty ? entry.action : old.action,
          mode: entry.mode.isNotEmpty ? entry.mode : old.mode,
          trigger: entry.trigger.isNotEmpty ? entry.trigger : old.trigger,
          strike: entry.strike > 0 ? entry.strike : old.strike,
          optionType: entry.optionType.isNotEmpty ? entry.optionType : old.optionType,
          status: old.status,
          assetType: entry.assetType ?? old.assetType,
          equitySymbol: entry.equitySymbol ?? old.equitySymbol,
          lots: entry.lots ?? old.lots,
          units: entry.units ?? old.units,
          lotsize: entry.lotsize ?? old.lotsize,
          entry: entry.entry ?? old.entry,
          sl: entry.sl ?? old.sl,
          tgt: entry.tgt ?? old.tgt,
          exitPrice: entry.exitPrice ?? old.exitPrice,
          ltp: entry.ltp ?? old.ltp,
          orderId: entry.orderId ?? old.orderId,
          parentBuyId: entry.parentBuyId ?? old.parentBuyId,
          mock: entry.mock ?? old.mock,
          message: entry.message ?? old.message,
        );
      } else {
        _logs[idx] = entry;
      }
    } else {
      _logs.add(entry);
    }
  }

  void mergeRemoteLogs(List<OrderLogEntry> remote, {bool? autoTrading}) {
    if (autoTrading != null) this.autoTrading = autoTrading;
    for (final entry in remote) {
      upsert(entry);
    }
  }

  /// Replace all in-memory rows for [day] with server sync (mobile mirrors PC log).
  void replaceDayLogs(String day, List<OrderLogEntry> remote, {bool? autoTrading}) {
    if (autoTrading != null) this.autoTrading = autoTrading;
    if (day.isNotEmpty) {
      _logs.removeWhere((l) => l.dayKey == day);
    } else {
      _logs.clear();
    }
    for (final entry in remote) {
      upsert(entry);
    }
    _logs.sort((a, b) => a.ts.compareTo(b.ts));
  }

  static const _openStatuses = {'open', 'submitted', 'simulated', 'target_pending', 'stoploss_pending'};

  static bool _shouldKeepExistingStatus(String existing, String incoming) {
    if (existing == incoming) return true;
    if (existing == 'failed' && incoming != 'failed') return false;
    if (existing != 'failed' && incoming == 'failed') return true;
    if (_openStatuses.contains(existing) && incoming == 'failed') return true;
    return false;
  }

  void recoverFailedBuy({
    required String orderId,
    required String status,
    String? equitySymbol,
    int? strike,
    String? optionType,
  }) {
    for (var i = 0; i < _logs.length; i++) {
      final old = _logs[i];
      if (old.action != 'BUY' || old.status != 'failed') continue;
      final equityMatch = equitySymbol != null &&
          old.equitySymbol?.toUpperCase() == equitySymbol.toUpperCase();
      final optionMatch = strike != null &&
          optionType != null &&
          old.strike == strike &&
          old.optionType == optionType;
      if (!equityMatch && !optionMatch) continue;
      _logs[i] = OrderLogEntry(
        id: orderId,
        ts: old.ts,
        dayKey: old.dayKey,
        action: old.action,
        mode: old.mode,
        trigger: old.trigger,
        strike: old.strike,
        optionType: old.optionType,
        status: status,
        assetType: old.assetType,
        equitySymbol: old.equitySymbol,
        lots: old.lots,
        units: old.units,
        lotsize: old.lotsize,
        entry: old.entry,
        sl: old.sl,
        tgt: old.tgt,
        exitPrice: old.exitPrice,
        ltp: old.ltp,
        orderId: orderId,
        parentBuyId: old.parentBuyId,
        mock: false,
        message: 'Recovered from mStock order book',
      );
    }
  }

  void updateStatus(String orderId, String status) {
    for (var i = 0; i < _logs.length; i++) {
      if (_logs[i].orderId == orderId || _logs[i].id == orderId) {
        final old = _logs[i];
        _logs[i] = OrderLogEntry(
          id: old.id,
          ts: old.ts,
          dayKey: old.dayKey,
          action: old.action,
          mode: old.mode,
          trigger: old.trigger,
          strike: old.strike,
          optionType: old.optionType,
          status: status,
          assetType: old.assetType,
          equitySymbol: old.equitySymbol,
          lots: old.lots,
          units: old.units,
          lotsize: old.lotsize,
          entry: old.entry,
          sl: old.sl,
          tgt: old.tgt,
          exitPrice: old.exitPrice,
          ltp: old.ltp,
          orderId: old.orderId,
          parentBuyId: old.parentBuyId,
          mock: old.mock,
          message: old.message,
        );
      }
    }
  }

  bool hasOrderId(String orderId) =>
      _logs.any((l) => l.orderId == orderId || l.id == orderId);

  OrderLogEntry addSell({
    required OrderLogEntry buy,
    required double exitPrice,
    required String trigger,
    required String status,
    bool mock = true,
    String? brokerOrderId,
    String? message,
  }) {
    final now = DateTime.now();
    final orderId = brokerOrderId ?? 'local-${_idSeq++}';
    final entry_ = OrderLogEntry(
      id: orderId,
      ts: now.millisecondsSinceEpoch,
      dayKey: buy.dayKey,
      action: 'SELL',
      mode: buy.mode,
      trigger: trigger,
      strike: buy.strike,
      optionType: buy.optionType,
      status: status,
      lots: buy.lots,
      units: buy.units,
      lotsize: buy.lotsize,
      entry: buy.entry,
      sl: buy.sl,
      tgt: buy.tgt,
      exitPrice: exitPrice,
      ltp: exitPrice,
      orderId: orderId,
      parentBuyId: buy.orderId ?? buy.id,
      mock: mock,
      message: message ?? (mock ? 'Simulated on-device exit' : 'Live mStock exit'),
    );
    _logs.add(entry_);
    return entry_;
  }

  void clear() => _logs.clear();
}
