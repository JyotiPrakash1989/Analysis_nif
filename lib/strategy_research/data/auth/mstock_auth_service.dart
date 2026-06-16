import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants/strategy_research_api_keys.dart';
import 'mstock_totp.dart';

/// mStock Type A auth — verifytotp, session/token, connect/login.
class MstockAuthService {
  MstockAuthService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  static const _base = 'https://api.mstock.trade';
  static const _version = '1';

  String get _apiKey =>
      StrategyResearchApiKeys.apiKey.trim().replaceAll('\uFEFF', '');

  Future<({String accessToken, String source})> bootstrapJwt({
    bool force = false,
    String? existingToken,
  }) async {
    if (!force && existingToken != null && existingToken.trim().isNotEmpty) {
      return (accessToken: existingToken.trim(), source: 'cached');
    }

    final totpSecret = StrategyResearchApiKeys.totpSecret;
    if (totpSecret.isNotEmpty) {
      try {
        final token = await verifyTotp();
        return (accessToken: token, source: 'verifytotp');
      } catch (e) {
        final msg = e.toString();
        if (!RegExp(r'totp.*not enabled', caseSensitive: false).hasMatch(msg)) {
          rethrow;
        }
      }
    }

    final envOtp = StrategyResearchApiKeys.smsOtp;
    if (envOtp.isNotEmpty) {
      final token = await generateSession(envOtp);
      return (accessToken: token, source: 'session/token');
    }

    throw MstockAuthException(
      'No JWT — set MSTOCK_TOTP_SECRET or enter SMS OTP in the app.',
    );
  }

  /// Auto TOTP → JWT (no SMS).
  Future<String> verifyTotp() async {
    if (_apiKey.isEmpty) {
      throw MstockAuthException('MSTOCK_API_KEY not set in .env');
    }
    final totp = MstockTotp.generateCode(StrategyResearchApiKeys.totpSecret);
    final json = await _formPost('/openapi/typea/session/verifytotp', {
      'api_key': _apiKey,
      'totp': totp,
    });
    return _extractToken(json, 'TOTP session failed');
  }

  /// SMS OTP → JWT.
  Future<String> generateSession(String smsOtp, {String checksum = 'L'}) async {
    if (_apiKey.isEmpty) {
      throw MstockAuthException('MSTOCK_API_KEY not set in .env');
    }
    final otp = smsOtp.trim();
    if (otp.isEmpty) {
      throw MstockAuthException('SMS OTP is required');
    }

    final checksums = <String>{checksum, 'L', 'W'};
    Object? lastErr;
    for (final c in checksums) {
      try {
        final json = await _formPost('/openapi/typea/session/token', {
          'api_key': _apiKey,
          'request_token': otp,
          'checksum': c,
        });
        return _extractToken(json, 'Session failed');
      } catch (e) {
        lastErr = e;
        if (e is MstockAuthException &&
            (e.code == 'OTP_EXPIRED' || e.code == 'OTP_INVALID')) {
          rethrow;
        }
      }
    }
    throw lastErr is Exception
        ? lastErr
        : MstockAuthException('Session failed');
  }

  /// Triggers SMS OTP to registered mobile.
  Future<String> connectLogin({String? username, String? password}) async {
    if (_apiKey.isEmpty) {
      throw MstockAuthException(
        'MSTOCK_API_KEY not set in .env',
        hint: 'Generate a key at trade.mstock.com → Trading APIs.',
      );
    }
    final user = (username ?? StrategyResearchApiKeys.username).trim();
    final pass = (password ?? StrategyResearchApiKeys.password).trim();
    if (user.isEmpty || pass.isEmpty) {
      throw MstockAuthException(
        'Username and password are required',
        hint: 'Set MSTOCK_USERNAME and MSTOCK_PASSWORD in .env, or enter them in the login dialog.',
      );
    }

    final json = await _formPost('/openapi/typea/connect/login', {
      'username': user,
      'password': pass,
    });

    final data = json['data'];
    if (data is Map && data['is_error']?.toString().toLowerCase() == 'true') {
      throw MstockAuthException(
        json['message']?.toString() ?? 'Login failed',
        hint: 'Check MSTOCK_USERNAME and MSTOCK_PASSWORD in .env.',
      );
    }

    final status = json['status']?.toString().toLowerCase();
    final ok = status == 'success' || json['status'] == true;
    if (!ok) {
      throw MstockAuthException(
        json['message']?.toString() ?? 'Login failed — OTP not sent',
        hint: 'Verify client ID and password match your mStock account.',
      );
    }

    return json['message']?.toString() ??
        'OTP sent to your registered mobile number.';
  }

  Future<Map<String, dynamic>> _formPost(
    String path,
    Map<String, String> fields,
  ) async {
    final body = fields.entries
        .map(
          (e) =>
              '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}',
        )
        .join('&');

    http.Response res;
    try {
      res = await _client
          .post(
            Uri.parse('$_base$path'),
            headers: {
              'X-Mirae-Version': _version,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body,
          )
          .timeout(const Duration(seconds: 25));
    } on Exception catch (e) {
      throw MstockAuthException(
        'Network error contacting mStock',
        hint: e.toString().length > 120
            ? '${e.toString().substring(0, 120)}…'
            : e.toString(),
      );
    }

    Map<String, dynamic>? json;
    try {
      final decoded = jsonDecode(res.body);
      if (decoded is Map<String, dynamic>) json = decoded;
      if (decoded is Map) json = Map<String, dynamic>.from(decoded);
    } catch (_) {}

    if (res.statusCode != 200) {
      if (path.contains('connect/login')) {
        throw _loginError(res.statusCode, json, res.body);
      }
      throw _sessionError(res.statusCode, json, res.body);
    }
    if (json == null) {
      throw MstockAuthException(
        'Invalid response from mStock',
        hint: res.body.isNotEmpty ? res.body.substring(0, res.body.length.clamp(0, 200)) : null,
      );
    }
    return json;
  }

  String _extractToken(Map<String, dynamic> json, String fallback) {
    final ok = json['status'] == 'success' || json['status'] == true;
    if (!ok) {
      throw _sessionError(200, json, '');
    }
    final data = json['data'];
    if (data is Map) {
      final token = data['access_token']?.toString();
      if (token != null && token.isNotEmpty) return token;
    }
    throw MstockAuthException(fallback);
  }

  MstockAuthException _loginError(
    int status,
    Map<String, dynamic>? json,
    String text,
  ) {
    final msg = json?['message']?.toString() ??
        (text.length > 320 ? text.substring(0, 320) : text);
    final display = msg.isNotEmpty ? msg : 'HTTP $status';
    if (RegExp(r'invalid username|invalid password|password', caseSensitive: false)
        .hasMatch(display)) {
      return MstockAuthException(
        display,
        code: 'LOGIN_FAILED',
        hint: 'Check MSTOCK_USERNAME and MSTOCK_PASSWORD in .env.',
      );
    }
    if (RegExp(r'api version', caseSensitive: false).hasMatch(display)) {
      return MstockAuthException(
        display,
        hint: 'mStock API version mismatch — update the app.',
      );
    }
    return MstockAuthException(
      display,
      hint: status >= 500
          ? 'mStock server error — try again in a minute.'
          : 'Check credentials and try Send OTP again.',
    );
  }

  MstockAuthException _sessionError(
    int status,
    Map<String, dynamic>? json,
    String text,
  ) {
    final msg = json?['message']?.toString() ??
        (text.length > 320 ? text.substring(0, 320) : text);
    final display = msg.isNotEmpty ? msg : 'HTTP $status';
    final type = json?['error_type']?.toString() ?? '';

    if (RegExp(r'otp.*expired|regenerate.*otp', caseSensitive: false)
        .hasMatch(display)) {
      return MstockAuthException(
        display,
        code: 'OTP_EXPIRED',
        hint: 'Request a new SMS OTP and enter it within 1–2 minutes.',
      );
    }
    if (type == 'APIKeyException' ||
        RegExp(r'API is suspended|APIKey|subscription', caseSensitive: false)
            .hasMatch(display)) {
      return MstockAuthException(
        display,
        code: 'API_KEY_INVALID',
        hint: 'Check MSTOCK_API_KEY at trade.mstock.com → Trading APIs.',
      );
    }
    if (RegExp(r'invalid otp|otp', caseSensitive: false).hasMatch(display)) {
      return MstockAuthException(
        display,
        code: 'OTP_INVALID',
        hint: 'Check the SMS code or request a new OTP.',
      );
    }
    return MstockAuthException(display);
  }
}

class MstockAuthException implements Exception {
  MstockAuthException(this.message, {this.code, this.hint});

  final String message;
  final String? code;
  final String? hint;

  @override
  String toString() => hint != null ? '$message ($hint)' : message;
}
