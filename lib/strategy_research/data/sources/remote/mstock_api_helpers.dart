import '../../constants/strategy_research_api_keys.dart';

/// True when JWT is a session token (not the raw API key).
bool hasMstockSessionJwt(String jwt, String apiKey) {
  final t = jwt.trim();
  final key = apiKey.trim();
  return t.isNotEmpty && key.isNotEmpty && t != key;
}

Map<String, String> mstockQuoteHeaders(String apiKey, String jwt) {
  final key = apiKey.trim().replaceAll('\uFEFF', '');
  final token = jwt.trim();
  final bearer =
      hasMstockSessionJwt(token, key) ? token : (token.isNotEmpty ? token : key);
  final headers = <String, String>{
    'X-Mirae-Version': '1',
    'Authorization': 'Bearer $bearer',
    'X-PrivateKey': key,
    'Content-Type': 'application/json',
  };
  final app = StrategyResearchApiKeys.appName.trim();
  if (app.isNotEmpty) {
    headers['X-App-Name'] = app;
  }
  return headers;
}

/// NIFTY index tokens — historical API uses 26000 per mStock annexure (999260 often IA400).
List<String> niftyHistTokenCandidates([String? explicit]) {
  final candidates = StrategyResearchApiKeys.niftyHistTokens;
  final token = explicit?.trim() ?? '';
  if (token.isEmpty) return candidates;
  if (candidates.contains(token)) {
    return [token, ...candidates.where((t) => t != token)];
  }
  return [token, ...candidates];
}

List<String> get niftyQuoteTokenCandidates => StrategyResearchApiKeys.niftyHistTokens;

const _orderIdKeys = [
  'orderid',
  'orderId',
  'uniqueorderid',
  'uniqueOrderId',
  'order_id',
  'OrderID',
  'exchangeorderid',
];

String? _pickOrderIdFromMap(Map map) {
  for (final key in _orderIdKeys) {
    final v = map[key];
    if (v == null) continue;
    final id = v.toString().trim();
    if (id.isNotEmpty) return id;
  }
  return null;
}

bool isMstockResponseOk(Map<String, dynamic>? json) {
  if (json == null) return false;
  if (parseMstockOrderId(json) != null) return true;
  if (json['success'] == true) return true;
  if (json['success'] == false) return false;
  final st = json['status'] ?? json['Status'];
  if (st == true || st == 1) return true;
  if (st == false || st == 0) return false;
  final s = st?.toString().trim().toLowerCase() ?? '';
  if (s == 'true' || s == '1' || s == 'success') return true;
  if (s == 'false' || s == '0' || s == 'error' || s == 'failed' || s == 'failure') {
    return false;
  }
  return false;
}

String mapMstockOrderBookStatus(String brokerStatus) {
  final s = brokerStatus.trim().toLowerCase();
  if (s.isEmpty) return 'submitted';
  if (s.contains('complete') ||
      s.contains('filled') ||
      s.contains('traded') ||
      s.contains('executed')) {
    return 'open';
  }
  if (s.contains('reject') || s.contains('cancel')) return 'failed';
  return 'submitted';
}

({String message, String errorcode}) extractMstockBrokerMessage(
  Map<String, dynamic>? json,
) {
  if (json == null) return (message: '', errorcode: '');
  final errorcode = (json['errorcode'] ??
          json['errorCode'] ??
          json['ErrorCode'] ??
          json['error_code'] ??
          '')
      .toString()
      .trim();
  final parts = <String>[];
  for (final key in [
    'message',
    'Message',
    'error',
    'Error',
    'errormsg',
    'errorMessage',
    'remarks',
    'reason',
    'msg',
  ]) {
    final v = json[key];
    if (v != null && v.toString().trim().isNotEmpty) {
      parts.add(v.toString().trim());
    }
  }
  final data = json['data'] ?? json['Data'];
  if (data is String && data.trim().isNotEmpty) {
    parts.add(data.trim());
  } else if (data is Map) {
    for (final key in ['message', 'Message', 'text', 'error', 'remarks']) {
      final v = data[key];
      if (v != null && v.toString().trim().isNotEmpty) {
        parts.add(v.toString().trim());
      }
    }
  }
  var message = parts.toSet().join(' — ');
  if (message.isNotEmpty && errorcode.isNotEmpty && !message.contains(errorcode)) {
    message = '$message ($errorcode)';
  } else if (message.isEmpty && errorcode.isNotEmpty) {
    message = errorcode;
  }
  return (message: message, errorcode: errorcode);
}

String? parseMstockOrderId(Map<String, dynamic>? json) {
  if (json == null) return null;
  final direct = _pickOrderIdFromMap(json);
  if (direct != null) return direct;
  final data = json['data'] ?? json['Data'];
  if (data is String) {
    final id = data.trim();
    if (RegExp(r'^\d+$').hasMatch(id)) return id;
  }
  if (data is List) {
    for (final item in data) {
      if (item is Map) {
        final id = _pickOrderIdFromMap(Map<String, dynamic>.from(item));
        if (id != null) return id;
      }
    }
  }
  if (data is Map) {
    return _pickOrderIdFromMap(Map<String, dynamic>.from(data));
  }
  return null;
}

String? parseEquitySymbolFromTradingsymbol(String tradingsymbol) {
  final sym = tradingsymbol.trim().toUpperCase();
  if (sym.isEmpty) return null;
  if (sym.endsWith('-EQ')) return sym.substring(0, sym.length - 3);
  return sym;
}

bool get canPlaceMstockOrders =>
    hasMstockSessionJwt(
      StrategyResearchApiKeys.jwtToken,
      StrategyResearchApiKeys.apiKey,
    );
