import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../auth/mstock_jwt_manager.dart';
import '../../constants/strategy_research_api_keys.dart';
import 'mstock_api_helpers.dart';

const _months = {
  'JAN': 1,
  'FEB': 2,
  'MAR': 3,
  'APR': 4,
  'MAY': 5,
  'JUN': 6,
  'JUL': 7,
  'AUG': 8,
  'SEP': 9,
  'OCT': 10,
  'NOV': 11,
  'DEC': 12,
};

class NiftyOptionLeg {
  const NiftyOptionLeg({
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.lotsize,
  });

  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final int lotsize;
}

int defaultNiftyLotSize() => 75;

int parseInstrumentLotSize(Map<String, dynamic> row) {
  for (final key in ['lotsize', 'lot_size', 'LotSize', 'lotSize']) {
    final raw = row[key];
    if (raw == null) continue;
    final n = int.tryParse(raw.toString().replaceAll(',', ''));
    if (n != null && n >= 1 && n <= 1000) return n;
  }
  return defaultNiftyLotSize();
}

String resolveTradingsymbol(Map<String, dynamic> row) {
  final candidates = [
    row['tradingsymbol'],
    row['trading_symbol'],
    row['TradingSymbol'],
    row['name'],
    row['symbol'],
  ]
      .map((s) => s?.toString().trim() ?? '')
      .where((s) => s.isNotEmpty)
      .toList();
  for (final c in candidates) {
    if (RegExp(r'(CE|PE)$', caseSensitive: false).hasMatch(c)) return c;
  }
  return candidates.isNotEmpty ? candidates.first : '';
}

List<Map<String, dynamic>> parseScripInstruments(String raw) {
  final t = raw.trim();
  if (t.startsWith('[')) {
    try {
      final arr = jsonDecode(t) as List<dynamic>;
      return arr
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return [];
    }
  }
  return [];
}

String nearestNiftyWeeklyExpiryIso([DateTime? now]) {
  final ist = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 5, minutes: 30));
  var candidate = DateTime.utc(ist.year, ist.month, ist.day);
  while (candidate.weekday != DateTime.tuesday) {
    candidate = candidate.add(const Duration(days: 1));
  }
  if (ist.weekday == DateTime.tuesday &&
      (ist.hour > 15 || (ist.hour == 15 && ist.minute >= 30))) {
    candidate = candidate.add(const Duration(days: 7));
  }
  return '${candidate.year.toString().padLeft(4, '0')}-'
      '${candidate.month.toString().padLeft(2, '0')}-'
      '${candidate.day.toString().padLeft(2, '0')}';
}

bool _isNiftyOption(Map<String, dynamic> row) {
  final sym = row['symbol']?.toString().toUpperCase() ?? '';
  final name = row['name']?.toString().toUpperCase() ?? '';
  final type = row['instrumenttype']?.toString().toUpperCase() ?? '';
  final seg = row['exch_seg']?.toString().toUpperCase() ?? '';
  if (!sym.contains('NIFTY') && !name.contains('NIFTY')) return false;
  if (type.isNotEmpty && !type.contains('OPT')) return false;
  if (seg.isNotEmpty && !RegExp(r'NFO|NSE|FO|BFO').hasMatch(seg)) return false;
  return RegExp(r'CE|PE').hasMatch(name) || RegExp(r'CE|PE').hasMatch(sym);
}

int? _parseStrike(Map<String, dynamic> row) {
  var strike = num.tryParse(row['strike']?.toString() ?? '');
  if (strike != null && strike > 0) {
    if (strike > 50000) strike = (strike / 100).round();
    return strike.round();
  }
  final name = (row['name'] ?? row['symbol'] ?? '').toString().toUpperCase();
  final m = RegExp(r'(\d{4,5})(CE|PE)$').firstMatch(name);
  if (m != null) return int.tryParse(m.group(1)!);
  return null;
}

bool _isCe(Map<String, dynamic> row) {
  final name = (row['name'] ?? row['symbol'] ?? '').toString().toUpperCase();
  return name.endsWith('CE');
}

bool _isPe(Map<String, dynamic> row) {
  final name = (row['name'] ?? row['symbol'] ?? '').toString().toUpperCase();
  return name.endsWith('PE');
}

String _expiryIsoToDdMmmYy(String iso) {
  final parts = iso.split('-');
  if (parts.length != 3) return '';
  final y = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  final d = int.tryParse(parts[2]);
  if (y == null || m == null || d == null) return '';
  final mon = _months.entries
      .firstWhere((e) => e.value == m, orElse: () => const MapEntry('JAN', 1))
      .key;
  final yy = (y % 100).toString().padLeft(2, '0');
  return '${d.toString().padLeft(2, '0')}$mon$yy';
}

bool _expiryMatches(String? expiryField, String expiryIso) {
  final tag = _expiryIsoToDdMmmYy(expiryIso);
  if (tag.isEmpty) return true;
  final e = (expiryField ?? '').toUpperCase().replaceAll(' ', '');
  if (e.contains(tag)) return true;
  final parts = expiryIso.split('-');
  if (parts.length == 3) {
    final monthNum = int.tryParse(parts[1]);
    final mon = _months.entries
        .firstWhere(
          (entry) => entry.value == monthNum,
          orElse: () => const MapEntry('JAN', 1),
        )
        .key;
    if (e.contains('${parts[2]}$mon')) return true;
  }
  return false;
}

/// Resolve NIFTY weekly option leg for place-order (mirrors stat_react).
class MstockScripMaster {
  MstockScripMaster({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  List<Map<String, dynamic>> _cache = [];
  int _cacheAt = 0;

  Future<List<Map<String, dynamic>>> loadInstruments() async {
    const maxAgeMs = 300000;
    if (_cache.isNotEmpty &&
        DateTime.now().millisecondsSinceEpoch - _cacheAt < maxAgeMs) {
      return _cache;
    }
    final apiKey = StrategyResearchApiKeys.apiKey;
    if (apiKey.isEmpty) return [];
    final uri = Uri.parse(
      '${StrategyResearchApiKeys.baseUrl}${StrategyResearchApiKeys.scripMasterPath}',
    );
    final headers = mstockQuoteHeaders(apiKey, StrategyResearchApiKeys.jwtToken);
    var response = await _client.get(uri, headers: headers).timeout(
          const Duration(seconds: 30),
        );
    if (response.statusCode == 401) {
      final refreshed = await MstockJwtManager.instance.refreshFromTotp();
      if (refreshed) {
        response = await _client
            .get(
              uri,
              headers: mstockQuoteHeaders(
                apiKey,
                StrategyResearchApiKeys.jwtToken,
              ),
            )
            .timeout(const Duration(seconds: 30));
      }
    }
    if (response.statusCode != 200) return [];
    _cache = parseScripInstruments(response.body);
    _cacheAt = DateTime.now().millisecondsSinceEpoch;
    return _cache;
  }

  Future<NiftyOptionLeg?> findNiftyOptionInstrument(
    int strike,
    String optionType,
  ) async {
    final instruments = await loadInstruments();
    final expiryIso = nearestNiftyWeeklyExpiryIso();
    final wantCe = optionType.toUpperCase() == 'CE';
    for (final row in instruments) {
      if (!_isNiftyOption(row)) continue;
      if (!_expiryMatches(
        row['expiry']?.toString() ?? row['name']?.toString(),
        expiryIso,
      )) {
        continue;
      }
      if (_parseStrike(row) != strike) continue;
      if (wantCe && !_isCe(row)) continue;
      if (!wantCe && !_isPe(row)) continue;
      final seg = row['exch_seg']?.toString().toUpperCase() ?? 'NFO';
      final exchange = seg.contains('BFO') ? 'BFO' : 'NFO';
      final tradingsymbol = resolveTradingsymbol(row);
      final symboltoken = row['token']?.toString().trim() ?? '';
      if (tradingsymbol.isEmpty || symboltoken.isEmpty) continue;
      if (!RegExp(r'(CE|PE)$', caseSensitive: false).hasMatch(tradingsymbol)) {
        continue;
      }
      return NiftyOptionLeg(
        tradingsymbol: tradingsymbol,
        symboltoken: symboltoken,
        exchange: exchange,
        lotsize: parseInstrumentLotSize(row),
      );
    }
    return null;
  }
}

/// Parse strike + CE/PE from broker tradingsymbol (e.g. NIFTY2560525000CE).
({int strike, String optionType})? parseNiftyOptionSymbol(String tradingsymbol) {
  final t = tradingsymbol.toUpperCase();
  final m = RegExp(r'NIFTY.*?(\d{4,5})(CE|PE)$').firstMatch(t);
  if (m == null) return null;
  final strike = int.tryParse(m.group(1)!);
  if (strike == null) return null;
  return (strike: strike, optionType: m.group(2)!);
}
