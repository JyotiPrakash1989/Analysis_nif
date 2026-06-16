import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Base URL for stat_react NiftyOptima server (REST + Socket.IO).
class NiftyOptimaApiConfig {
  NiftyOptimaApiConfig._();

  static String get baseUrl {
    final fromEnv = dotenv.maybeGet('NIFTYOPTIMA_API')?.trim();
    if (fromEnv != null && fromEnv.isNotEmpty) {
      return fromEnv.replaceAll(RegExp(r'/+$'), '');
    }
    return 'http://localhost:3200';
  }

  /// True when a reachable LAN/server URL is configured (not localhost on mobile).
  static bool get hasRemoteBackend {
    final url = baseUrl.toLowerCase();
    if (url.contains('localhost') || url.contains('127.0.0.1')) return false;
    return url.startsWith('http://') || url.startsWith('https://');
  }

  static String get remoteBackendHint =>
      'Set NIFTYOPTIMA_API=http://YOUR_PC_LAN_IP:3200 in .env and run '
      'cd stat_react && npm run dev on your PC (same Wi‑Fi as the phone).';

  static const niftySpotPath = '/api/nifty-spot';
  static const niftyHistoryPath = '/api/nifty-history';
  static const ordersLogPath = '/api/orders/log';
  static const placeOrderPath = '/api/place-order';
  static const cancelOrderPath = '/api/cancel-order';
  static const tradingSettingsPath = '/api/trading/settings';
  static const equityAnalyzePath = '/api/equity/analyze';
  static const equityWatchlistPath = '/api/equity/watchlist';
  static const healthPath = '/api/health';
  static const authStatusPath = '/api/mstock/auth-status';
  static const mstockOrdersPath = '/api/mstock/orders';
}
