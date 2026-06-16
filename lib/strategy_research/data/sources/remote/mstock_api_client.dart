import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../../niftyoptima/data/constants/niftyoptima_api_config.dart';
import '../../../../niftyoptima/data/local/public_nifty_spot.dart';
import '../../auth/mstock_jwt_manager.dart';
import '../../constants/strategy_research_api_keys.dart';
import '../../dtos/mstock_historical_dto.dart';
import 'mstock_api_helpers.dart';

/// mStock Type B API client – real-time quote and historical data.
/// API docs: https://tradingapi.mstock.com/docs/v1/typeB/
///   - Market Quote: /openapi/typeb/instruments/quote (GET, body: mode, exchangeTokens)
///   - Historical:   /openapi/typeb/instruments/historical (GET, body: exchange, symboltoken, interval, fromdate, todate)
/// Keys from .env: MSTOCK_API_KEY, MSTOCK_APP_NAME, MSTOCK_JWT_TOKEN (for quote/historical).
class MstockApiClient {
  MstockApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  static String? _cachedNiftyHistToken;

  static String get _authBearer => StrategyResearchApiKeys.jwtToken;

  /// User-friendly message when API returns 401 (missing/expired JWT).
  static String get _unauthorizedHint {
    if (StrategyResearchApiKeys.totpSecret.isNotEmpty) {
      return 'Session expired — app will auto-refresh TOTP login.';
    }
    return StrategyResearchApiKeys.jwtToken.isEmpty
        ? 'Login required — use TOTP in .env or SMS OTP in the app.'
        : 'Session expired (valid until midnight). Refresh login.';
  }

  Future<bool> _refreshJwtOn401() async {
    return MstockJwtManager.instance.bootstrapIfNeeded(force: true);
  }

  static bool _isInvalidSecurityToken(String? message) {
    if (message == null || message.isEmpty) return false;
    return RegExp(
      r'security id not found|IA400|invalid symbol|contract file',
      caseSensitive: false,
    ).hasMatch(message);
  }

  List<String> _resolveHistTokens(String exchange, String symbolToken) {
    if (exchange == 'NSE') {
      final candidates = niftyHistTokenCandidates(symbolToken);
      final cached = _cachedNiftyHistToken;
      if (cached != null && candidates.contains(cached)) {
        return [cached, ...candidates.where((t) => t != cached)];
      }
      return candidates;
    }
    final token = symbolToken.trim();
    if (token.isNotEmpty) return [token];
    return StrategyResearchApiKeys.niftyHistTokens;
  }

  static String _sessionRequiredMessage() {
    if (StrategyResearchApiKeys.totpSecret.isNotEmpty) {
      return 'mStock session JWT required. Sign in via Auto TOTP or SMS OTP in Settings.';
    }
    return 'mStock session JWT required. TOTP is not enabled — sign in with SMS OTP '
        '(Settings → mStock account).';
  }

  /// Fetches historical candles from mStock Type B historical API.
  /// [symbolToken] e.g. 999260 for NIFTY 50 index (NSE). Use Script Master for other tokens.
  /// [fromDate], [toDate] format: 'yyyy-MM-dd HH:mm' (e.g. 2024-08-02 09:15).
  Future<MstockHistoricalResponseDto> getHistoricalCandles({
    required String exchange,
    required String symbolToken,
    String interval = 'ONE_MINUTE',
    required String fromDate,
    required String toDate,
  }) async {
    final apiKey = StrategyResearchApiKeys.apiKey;
    if (apiKey.isEmpty) {
      return const MstockHistoricalResponseDto(
        status: false,
        message: 'MSTOCK_API_KEY not set in .env',
      );
    }

    await MstockJwtManager.instance.bootstrapIfNeeded();

    if (!hasMstockSessionJwt(_authBearer, apiKey)) {
      return MstockHistoricalResponseDto(
        status: false,
        message: _sessionRequiredMessage(),
      );
    }

    final bodyBase = {
      'exchange': exchange,
      'interval': interval,
      'fromdate': fromDate,
      'todate': toDate,
    };

    final remote = await _fetchHistoricalViaRemote(bodyBase, symbolToken);
    if (remote != null && remote.isSuccess) return remote;

    final uri = Uri.parse(
      '${StrategyResearchApiKeys.baseUrl}${StrategyResearchApiKeys.historicalPath}',
    );

    var lastError = remote?.message ?? '';
    for (final token in _resolveHistTokens(exchange, symbolToken)) {
      final body = jsonEncode({...bodyBase, 'symboltoken': token});
      for (final method in ['POST', 'GET']) {
        try {
          var response = await _sendJsonRequest(uri, apiKey, body, method);

          if (response.statusCode == 401) {
            await MstockJwtManager.instance.invalidateOnUnauthorized();
            final refreshed = await _refreshJwtOn401();
            if (refreshed) {
              response = await _sendJsonRequest(uri, apiKey, body, method);
            }
          }

          if (response.statusCode != 200) {
            final raw = response.body;
            if (isMstockIpMismatch(raw)) {
              final viaPc = await _fetchHistoricalViaRemote(bodyBase, symbolToken);
              if (viaPc != null && viaPc.isSuccess) return viaPc;
              return MstockHistoricalResponseDto(
                status: false,
                message: '${_formatHttpError(response.statusCode, raw)}\n'
                    '$mstockIpWhitelistHint()\n'
                    '${NiftyOptimaApiConfig.remoteBackendHint}',
              );
            }
            lastError = response.statusCode == 401
                ? _unauthorizedHint
                : _formatHttpError(response.statusCode, raw);
            continue;
          }

          final decoded = jsonDecode(response.body) as Map<String, dynamic>?;
          if (decoded == null) {
            lastError = 'Invalid JSON response';
            continue;
          }

          final dto = MstockHistoricalResponseDto.fromJson(decoded);
          if (dto.isSuccess) {
            if (exchange == 'NSE') _cachedNiftyHistToken = token;
            return dto;
          }

          lastError = dto.message.isNotEmpty
              ? dto.message
              : 'No historical candles';
          if (_isInvalidSecurityToken(lastError)) break;
        } catch (e) {
          lastError = e.toString();
        }
      }
      if (_isInvalidSecurityToken(lastError)) continue;
    }

    if (lastError.isEmpty) lastError = 'Historical API failed';
    if (isMstockIpMismatch(lastError)) {
      lastError = '$lastError\n${mstockIpWhitelistHint()}\n'
          '${NiftyOptimaApiConfig.remoteBackendHint}';
    }
    return MstockHistoricalResponseDto(status: false, message: lastError);
  }

  /// Routes historical through stat_react on PC (whitelisted IP) when configured.
  Future<MstockHistoricalResponseDto?> _fetchHistoricalViaRemote(
    Map<String, dynamic> bodyBase,
    String symbolToken,
  ) async {
    if (!NiftyOptimaApiConfig.hasRemoteBackend) return null;
    final uri = Uri.parse(
      '${NiftyOptimaApiConfig.baseUrl}/api/mstock/historical',
    );
    for (final token in _resolveHistTokens(
      bodyBase['exchange']?.toString() ?? 'NSE',
      symbolToken,
    )) {
      final payload = {...bodyBase, 'symboltoken': token};
      try {
        final res = await _client
            .post(
              uri,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode(payload),
            )
            .timeout(const Duration(seconds: 20));
        if (res.statusCode != 200) continue;
        final decoded = jsonDecode(res.body) as Map<String, dynamic>?;
        if (decoded == null) continue;
        final dto = MstockHistoricalResponseDto.fromJson(decoded);
        if (dto.isSuccess) {
          if (bodyBase['exchange'] == 'NSE') _cachedNiftyHistToken = token;
          return dto;
        }
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  static String _formatHttpError(int statusCode, String body) {
    final decoded = _tryDecode(body);
    final broker = extractMstockBrokerMessage(decoded);
    if (broker.message.isNotEmpty) {
      return 'HTTP $statusCode: ${broker.message}';
    }
    final trimmed = body.length > 200 ? '${body.substring(0, 200)}…' : body;
    return 'HTTP $statusCode: $trimmed';
  }

  /// Checks if live data API is working. Returns (ok, message) for UI.
  Future<({bool ok, String message})> checkLiveDataApi() async {
    final to = DateTime.now();
    final from = to.subtract(const Duration(days: 2));
    final fromStr = '${from.year}-${from.month.toString().padLeft(2, '0')}-${from.day.toString().padLeft(2, '0')} 09:15';
    final toStr = '${to.year}-${to.month.toString().padLeft(2, '0')}-${to.day.toString().padLeft(2, '0')} 15:30';

    final response = await getHistoricalCandles(
      exchange: 'NSE',
      symbolToken: '',
      interval: 'ONE_MINUTE',
      fromDate: fromStr,
      toDate: toStr,
    );

    if (response.isSuccess) {
      return (ok: true, message: 'Live data API: Working (${response.candles.length} candles)');
    }
    return (ok: false, message: 'Live data API: ${response.message}');
  }

  /// Fetches live NIFTY 50 index (LTP) from mStock quote API.
  /// Tries POST then GET, LTP then OHLC mode. Returns (value, errorMessage); value null on failure.
  Future<({double? value, String? error})> getNiftyQuote() async {
    final apiKey = StrategyResearchApiKeys.apiKey;
    if (apiKey.isEmpty) {
      return (value: null, error: 'MSTOCK_API_KEY not set in .env');
    }

    await MstockJwtManager.instance.bootstrapIfNeeded();
    if (!hasMstockSessionJwt(_authBearer, apiKey)) {
      return (value: null, error: _sessionRequiredMessage());
    }

    final uri = Uri.parse(
      '${StrategyResearchApiKeys.baseUrl}${StrategyResearchApiKeys.quotePath}',
    );

    String? lastError;

    for (final symboltoken in niftyQuoteTokenCandidates) {
      final body = jsonEncode({
        'mode': 'LTP',
        'exchangeTokens': {'NSE': [symboltoken]},
      });

      for (final method in ['POST', 'GET']) {
        try {
          var response = await _sendJsonRequest(uri, apiKey, body, method);

          if (response.statusCode == 401) {
            await MstockJwtManager.instance.invalidateOnUnauthorized();
            final refreshed = await _refreshJwtOn401();
            if (refreshed) {
              response = await _sendJsonRequest(uri, apiKey, body, method);
            }
          }

          if (response.statusCode != 200) {
            lastError = response.statusCode == 401
                ? _unauthorizedHint
                : 'HTTP ${response.statusCode}: ${_tryDecode(response.body)?['message'] ?? response.body}';
            continue;
          }
          final decoded = jsonDecode(response.body) as Map<String, dynamic>?;
          if (decoded == null) {
            lastError = 'Invalid JSON';
            continue;
          }
          if (!isMstockResponseOk(decoded)) {
            lastError = decoded['message']?.toString() ?? 'Quote status failed';
            continue;
          }
          final ltp = _readLtpFromQuoteJson(decoded);
          if (ltp != null) return (value: ltp, error: null);
          lastError = 'No LTP in response';
        } catch (e) {
          lastError = e.toString();
        }
      }
    }

    for (final symboltoken in niftyQuoteTokenCandidates) {
      final ohlcBody = jsonEncode({
        'mode': 'OHLC',
        'exchangeTokens': {'NSE': [symboltoken]},
      });
      try {
        final response = await _sendJsonRequest(uri, apiKey, ohlcBody, 'POST');
        if (response.statusCode == 200) {
          final decoded = jsonDecode(response.body) as Map<String, dynamic>?;
          final ltp = decoded != null ? _readLtpFromQuoteJson(decoded) : null;
          if (ltp != null) return (value: ltp, error: null);
        }
      } catch (_) {}
    }

    return (value: null, error: lastError ?? 'Quote API failed');
  }

  static double? _readLtpFromQuoteJson(Map<String, dynamic> decoded) {
    final data = decoded['data'];
    List? fetched;
    if (data is Map && data['fetched'] is List) {
      fetched = data['fetched'] as List;
    } else if (decoded['fetched'] is List) {
      fetched = decoded['fetched'] as List;
    } else if (data is List) {
      fetched = data;
    }
    if (fetched == null || fetched.isEmpty) return null;
    final first = fetched.first;
    if (first is! Map) return null;
    for (final key in ['ltp', 'close', 'last_price', 'lastPrice']) {
      final v = first[key];
      if (v is num) return v.toDouble();
      if (v is String) {
        final n = double.tryParse(v.replaceAll(',', ''));
        if (n != null) return n;
      }
    }
    return null;
  }

  Future<http.Response> _sendJsonRequest(
    Uri uri,
    String apiKey,
    String body,
    String method,
  ) async {
    final request = http.Request(method, uri)
      ..headers.addAll(mstockQuoteHeaders(apiKey, _authBearer))
      ..body = body;
    final streamed = await _client.send(request).timeout(const Duration(seconds: 15));
    return http.Response.fromStream(streamed);
  }

  static Map<String, dynamic>? _tryDecode(String body) {
    try {
      return jsonDecode(body) as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  /// Fetches last available NIFTY from historical candles (fallback when quote fails).
  Future<double?> getNiftyFromLastCandle() async {
    final to = DateTime.now();
    final from = to.subtract(const Duration(days: 2));
    final fromStr = '${from.year}-${from.month.toString().padLeft(2, '0')}-${from.day.toString().padLeft(2, '0')} 09:15';
    final toStr = '${to.year}-${to.month.toString().padLeft(2, '0')}-${to.day.toString().padLeft(2, '0')} 15:30';
    final response = await getHistoricalCandles(
      exchange: 'NSE',
      symbolToken: '',
      interval: 'ONE_MINUTE',
      fromDate: fromStr,
      toDate: toStr,
    );
    if (!response.isSuccess || response.candles.isEmpty) return null;
    final last = response.candles.last;
    if (last.length >= 5 && last[4] is num) return (last[4] as num).toDouble();
    return null;
  }
}
