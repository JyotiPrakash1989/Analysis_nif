import 'package:flutter_dotenv/flutter_dotenv.dart';

/// mStock Trading API (Type B) – as per official API docs.
/// Docs: https://tradingapi.mstock.com/docs/v1/typeB/
abstract class StrategyResearchApiKeys {
  static const String baseUrl = 'https://api.mstock.trade';
  static const String historicalPath = '/openapi/typeb/instruments/historical';
  static const String quotePath = '/openapi/typeb/instruments/quote';
  static const String scripMasterPath =
      '/openapi/typeb/instruments/OpenAPIScripMaster';
  static const String placeOrderPath = '/openapi/typeb/orders/regular';
  static const String ordersPath = '/openapi/typeb/orders';

  static String? _runtimeJwt;

  static String get apiKey => dotenv.env['MSTOCK_API_KEY'] ?? '';
  static String get appName => dotenv.env['MSTOCK_APP_NAME'] ?? 'JPAPP';
  static String get totpSecret => dotenv.env['MSTOCK_TOTP_SECRET'] ?? '';
  static String get smsOtp =>
      dotenv.env['MSTOCK_OTP'] ?? dotenv.env['MSTOCK_REQUEST_TOKEN'] ?? '';
  static String get username => dotenv.env['MSTOCK_USERNAME'] ?? '';
  static String get password => dotenv.env['MSTOCK_PASSWORD'] ?? '';
  static String get checksum => dotenv.env['MSTOCK_CHECKSUM'] ?? 'L';

  static String get envJwtToken => dotenv.env['MSTOCK_JWT_TOKEN'] ?? '';

  /// Comma-separated NIFTY historical tokens (mirrors stat_react MSTOCK_NIFTY_HIST_TOKEN).
  static List<String> get niftyHistTokens {
    final raw = dotenv.env['MSTOCK_NIFTY_HIST_TOKEN'] ?? '26000,99926000,999260';
    return raw
        .split(',')
        .map((t) => t.trim())
        .where((t) => t.isNotEmpty)
        .toList();
  }

  /// Active JWT: auto-login session first, then .env.
  static String get jwtToken => _runtimeJwt ?? envJwtToken;

  static void setRuntimeJwt(String? token) => _runtimeJwt = token;
}
