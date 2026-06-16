import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../domain/entities/niftyoptima_models.dart';
import '../../constants/niftyoptima_api_config.dart';
import '../../../../strategy_research/data/constants/strategy_research_api_keys.dart';
import '../../../../strategy_research/data/sources/remote/mstock_api_helpers.dart';

/// Routes orders through stat_react server (whitelisted PC IP), mirroring React web.
class NiftyOptimaRemoteClient {
  NiftyOptimaRemoteClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<bool> isReachable() async {
    if (!NiftyOptimaApiConfig.hasRemoteBackend) return false;
    try {
      final uri = Uri.parse(
        '${NiftyOptimaApiConfig.baseUrl}${NiftyOptimaApiConfig.healthPath}',
      );
      final res = await _client.get(uri).timeout(const Duration(seconds: 4));
      if (res.statusCode != 200) return false;
      final json = jsonDecode(res.body) as Map<String, dynamic>?;
      return json?['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<OrderLogResponse?> fetchOrderLog({String? day}) async {
    if (!NiftyOptimaApiConfig.hasRemoteBackend) return null;
    final q = day != null && day.isNotEmpty ? '?day=${Uri.encodeQueryComponent(day)}' : '';
    final uri = Uri.parse(
      '${NiftyOptimaApiConfig.baseUrl}${NiftyOptimaApiConfig.ordersLogPath}$q',
    );
    final res = await _client.get(uri).timeout(const Duration(seconds: 12));
    if (res.statusCode != 200) return null;
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return OrderLogResponse.fromJson(json);
  }

  static const _loginRequiredMessage =
      'mStock login required — open Settings → Log in with SMS OTP before placing orders. '
      '(TOTP is not enabled on your account.)';

  Future<List<Map<String, dynamic>>> fetchMstockOrderBook() async {
    if (!NiftyOptimaApiConfig.hasRemoteBackend) return [];
    // Server falls back to its own mStock JWT when the phone has no session.
    final jwt = StrategyResearchApiKeys.jwtToken.trim();
    final q = jwt.isNotEmpty ? '?jwt=${Uri.encodeQueryComponent(jwt)}' : '';
    final uri = Uri.parse(
      '${NiftyOptimaApiConfig.baseUrl}${NiftyOptimaApiConfig.mstockOrdersPath}$q',
    );
    try {
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final json = jsonDecode(res.body) as Map<String, dynamic>?;
      if (json?['ok'] != true) return [];
      final orders = json?['orders'];
      if (orders is! List) return [];
      return orders
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<({bool ok, String message, String? orderId, bool unreachable, OrderLogEntry? log})>
      placeOrder({
    required int strike,
    required String optionType,
    required double entry,
    required double sl,
    required double tgt,
    int quantity = 1,
    String trigger = 'manual',
  }) async {
    if (!NiftyOptimaApiConfig.hasRemoteBackend) {
      return (
        ok: false,
        message: '',
        orderId: null,
        unreachable: true,
        log: null,
      );
    }

    if (!canPlaceMstockOrders) {
      return (
        ok: false,
        message: _loginRequiredMessage,
        orderId: null,
        unreachable: false,
        log: null,
      );
    }

    final uri = Uri.parse(
      '${NiftyOptimaApiConfig.baseUrl}${NiftyOptimaApiConfig.placeOrderPath}',
    );
    final body = jsonEncode({
      'symbol': 'NIFTY',
      'strike': strike,
      'optionType': optionType,
      'quantity': quantity,
      'entry': entry,
      'sl': sl,
      'tgt': tgt,
      'trigger': trigger,
      'requireBroker': true,
      'jwt': StrategyResearchApiKeys.jwtToken,
    });

    try {
      final res = await _client
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: body,
          )
          .timeout(const Duration(seconds: 25));

      Map<String, dynamic>? data;
      try {
        data = jsonDecode(res.body) as Map<String, dynamic>?;
      } catch (_) {
        final httpOk = res.statusCode >= 200 && res.statusCode < 300;
        return (
          ok: false,
          message: httpOk
              ? 'Invalid response from NiftyOptima server'
              : 'Order failed (HTTP ${res.statusCode}). Is stat_react running? npm run dev',
          orderId: null,
          unreachable: false,
          log: null,
        );
      }

      final httpOk = res.statusCode >= 200 && res.statusCode < 300;
      final ok = httpOk && data?['ok'] != false;
      final message = data?['message']?.toString() ?? '';
      if (!ok) {
        return (
          ok: false,
          message: message.isNotEmpty
              ? message
              : 'Order failed (HTTP ${res.statusCode})',
          orderId: null,
          unreachable: false,
          log: null,
        );
      }

      final orderId = data?['orderId']?.toString().trim();
      final mock = data?['mock'] == true;
      final broker = data?['broker'] == true;
      if (orderId == null ||
          orderId.isEmpty ||
          mock ||
          orderId.startsWith('MOCK-') ||
          !broker) {
        return (
          ok: false,
          message: message.isNotEmpty ? message : _loginRequiredMessage,
          orderId: null,
          unreachable: false,
          log: null,
        );
      }

      final lots = (data?['lots'] ?? data?['quantity'] ?? quantity) as num;
      final lotsize = (data?['lotsize'] ?? 75) as num;
      final units = (data?['brokerQuantity'] ?? lots * lotsize) as num;
      final displayMessage =
          message.isNotEmpty ? message : 'Live order placed on mStock';

      final log = OrderLogEntry(
        id: orderId,
        ts: DateTime.now().millisecondsSinceEpoch,
        dayKey: '',
        action: 'BUY',
        mode: trigger == 'signal' ? 'auto' : 'manual',
        trigger: trigger,
        strike: strike,
        optionType: optionType,
        status: mock ? 'simulated' : 'submitted',
        lots: lots.round(),
        units: units.round(),
        lotsize: lotsize.round(),
        entry: entry,
        sl: sl,
        tgt: tgt,
        ltp: entry,
        orderId: orderId,
        mock: mock,
        message: displayMessage.isNotEmpty ? displayMessage : 'Order placed via server',
      );

      return (
        ok: true,
        message: displayMessage.isNotEmpty ? displayMessage : 'Order placed',
        orderId: orderId,
        unreachable: false,
        log: log,
      );
    } catch (e) {
      final detail = e.toString().replaceFirst('Exception: ', '');
      return (
        ok: false,
        message: 'Cannot reach ${NiftyOptimaApiConfig.baseUrl}. '
            'Run cd stat_react && npm run dev on your PC (same Wi‑Fi). '
            'Allow port 3200 in Windows Firewall. ($detail)',
        orderId: null,
        unreachable: true,
        log: null,
      );
    }
  }

  Future<({bool ok, String message, String? orderId, bool unreachable})> placeSell({
    required int strike,
    required String optionType,
    required double entry,
    required double sl,
    required double tgt,
    int quantity = 1,
    String trigger = 'manual',
    String? parentBuyId,
  }) async {
    if (!NiftyOptimaApiConfig.hasRemoteBackend) {
      return (ok: false, message: '', orderId: null, unreachable: true);
    }
    if (!canPlaceMstockOrders) {
      return (ok: false, message: _loginRequiredMessage, orderId: null, unreachable: false);
    }

    final uri = Uri.parse(
      '${NiftyOptimaApiConfig.baseUrl}${NiftyOptimaApiConfig.placeOrderPath}',
    );
    final body = jsonEncode({
      'symbol': 'NIFTY',
      'strike': strike,
      'optionType': optionType,
      'quantity': quantity,
      'entry': entry,
      'sl': sl,
      'tgt': tgt,
      'transactiontype': 'SELL',
      'trigger': trigger,
      'requireBroker': true,
      'jwt': StrategyResearchApiKeys.jwtToken,
      if (parentBuyId != null) 'parentBuyId': parentBuyId,
    });

    try {
      final res = await _client
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: body,
          )
          .timeout(const Duration(seconds: 25));

      Map<String, dynamic>? data;
      try {
        data = jsonDecode(res.body) as Map<String, dynamic>?;
      } catch (_) {
        return (
          ok: false,
          message: 'Invalid response from server (HTTP ${res.statusCode})',
          orderId: null,
          unreachable: false,
        );
      }

      final httpOk = res.statusCode >= 200 && res.statusCode < 300;
      final ok = httpOk && data?['ok'] != false;
      final message = data?['message']?.toString() ?? '';
      if (!ok) {
        return (
          ok: false,
          message: message.isNotEmpty ? message : 'Sell failed (HTTP ${res.statusCode})',
          orderId: null,
          unreachable: false,
        );
      }

      final orderId = data?['orderId']?.toString().trim();
      final mock = data?['mock'] == true;
      final broker = data?['broker'] == true;
      if (!ok ||
          orderId == null ||
          orderId.isEmpty ||
          mock ||
          orderId.startsWith('MOCK-') ||
          !broker) {
        return (
          ok: false,
          message: message.isNotEmpty ? message : _loginRequiredMessage,
          orderId: null,
          unreachable: false,
        );
      }
      return (
        ok: true,
        message: message.isNotEmpty ? message : 'Sell placed on mStock',
        orderId: orderId,
        unreachable: false,
      );
    } catch (e) {
      final detail = e.toString().replaceFirst('Exception: ', '');
      return (
        ok: false,
        message: 'Cannot reach server: $detail',
        orderId: null,
        unreachable: true,
      );
    }
  }
}
