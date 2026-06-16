import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../auth/mstock_jwt_manager.dart';
import '../../constants/strategy_research_api_keys.dart';
import 'mstock_api_helpers.dart';
import 'mstock_scrip_master.dart';

class MstockOrderResult {
  const MstockOrderResult({
    required this.ok,
    this.orderId,
    this.message = '',
    this.mock = false,
    this.tradingsymbol,
    this.exchange,
    this.lotsize,
    this.units,
  });

  final bool ok;
  final String? orderId;
  final String message;
  final bool mock;
  final String? tradingsymbol;
  final String? exchange;
  final int? lotsize;
  final int? units;
}

class MstockOrderClient {
  MstockOrderClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  double _roundOptionPrice(double entry) {
    const tick = 0.05;
    return (entry / tick).round() * tick;
  }

  ({String stoploss, String squareoff, bool useBracket}) _bracketLegs(
    double entry,
    double sl,
    double tgt,
    String transactiontype,
  ) {
    if (transactiontype != 'BUY' || entry <= 0) {
      return (stoploss: '0', squareoff: '0', useBracket: false);
    }
    if (sl <= 0 || tgt <= 0 || tgt <= entry || sl >= entry) {
      return (stoploss: '0', squareoff: '0', useBracket: false);
    }
    final slPts = _roundOptionPrice(entry - sl);
    final tgtPts = _roundOptionPrice(tgt - entry);
    if (slPts <= 0 || tgtPts <= 0) {
      return (stoploss: '0', squareoff: '0', useBracket: false);
    }
    return (
      stoploss: slPts.toStringAsFixed(2),
      squareoff: tgtPts.toStringAsFixed(2),
      useBracket: true,
    );
  }

  Future<MstockOrderResult> placeNiftyOptionOrder({
    required NiftyOptionLeg leg,
    required int lots,
    required double entry,
    required double sl,
    required double tgt,
    String transactiontype = 'BUY',
    String ordertag = 'niftyoptima',
  }) async {
    final apiKey = StrategyResearchApiKeys.apiKey;
    final jwt = StrategyResearchApiKeys.jwtToken;
    if (!hasMstockSessionJwt(jwt, apiKey)) {
      return const MstockOrderResult(
        ok: false,
        message: 'mStock login required — use TOTP in .env or SMS OTP in the app.',
      );
    }

    final units = lots * leg.lotsize;
    if (units < 1) {
      return MstockOrderResult(
        ok: false,
        message: 'Invalid order size: $lots lot(s) × ${leg.lotsize} units/lot',
      );
    }

    const orderType = 'LIMIT';
    final bracket = _bracketLegs(entry, sl, tgt, transactiontype);
    final attachLegs = transactiontype == 'BUY' && bracket.useBracket;
    const producttype = 'CARRYFORWARD';
    final price = _roundOptionPrice(entry).toStringAsFixed(2);

    final payload = {
      'variety': 'NORMAL',
      'tradingsymbol': leg.tradingsymbol,
      'symboltoken': leg.symboltoken,
      'exchange': leg.exchange,
      'transactiontype': transactiontype,
      'ordertype': orderType,
      'quantity': units.toString(),
      'producttype': producttype,
      'price': price,
      'triggerprice': '0',
      'squareoff': attachLegs ? bracket.squareoff : '0',
      'stoploss': attachLegs ? bracket.stoploss : '0',
      'trailingStopLoss': '0',
      'disclosedquantity': '0',
      'duration': 'DAY',
      'ordertag': ordertag,
    };

    final uri = Uri.parse(
      '${StrategyResearchApiKeys.baseUrl}${StrategyResearchApiKeys.placeOrderPath}',
    );
    final headers = mstockQuoteHeaders(apiKey, jwt);
    try {
      var response = await _client
          .post(uri, headers: headers, body: jsonEncode(payload))
          .timeout(const Duration(seconds: 20));
      if (response.statusCode == 401) {
        final refreshed = await MstockJwtManager.instance.refreshFromTotp();
        if (refreshed) {
          response = await _client
              .post(
                uri,
                headers: mstockQuoteHeaders(
                  apiKey,
                  StrategyResearchApiKeys.jwtToken,
                ),
                body: jsonEncode(payload),
              )
              .timeout(const Duration(seconds: 20));
        }
      }

      Map<String, dynamic>? json;
      try {
        json = jsonDecode(response.body) as Map<String, dynamic>?;
      } catch (_) {
        final body = response.body.length > 120
            ? response.body.substring(0, 120)
            : response.body;
        return MstockOrderResult(
          ok: false,
          message:
              'Broker response not JSON (HTTP ${response.statusCode}): $body',
        );
      }

      var orderId = parseMstockOrderId(json);
      if (!isMstockResponseOk(json) || orderId == null || orderId.isEmpty) {
        final reconciled = await _reconcileFromOrderBook(
          tradingsymbol: leg.tradingsymbol,
          transactiontype: transactiontype,
          quantity: units,
        );
        if (reconciled != null) {
          orderId = reconciled;
        } else if (!isMstockResponseOk(json)) {
          final extracted = extractMstockBrokerMessage(json);
          var message = extracted.message.isNotEmpty
              ? extracted.message
              : 'Order rejected by broker';
          if (response.statusCode == 400 || response.statusCode == 403) {
            if (RegExp(
              r'IA403|ip address are not matching|Primary and Secondary IP',
              caseSensitive: false,
            ).hasMatch(message + response.body)) {
              message =
                  'mStock IP whitelist blocked this device. $message\n'
                  'Or route orders via PC server — set NIFTYOPTIMA_API in .env.';
            }
          }
          return MstockOrderResult(ok: false, message: message);
        } else {
          return const MstockOrderResult(
            ok: false,
            message: 'Broker accepted but no order id — check mStock order book.',
          );
        }
      }

      final extracted = extractMstockBrokerMessage(json);
      return MstockOrderResult(
        ok: true,
        orderId: orderId,
        message: extracted.message.isNotEmpty ? extracted.message : 'Order placed',
        tradingsymbol: leg.tradingsymbol,
        exchange: leg.exchange,
        lotsize: leg.lotsize,
        units: units,
      );
    } catch (e) {
      return MstockOrderResult(ok: false, message: e.toString());
    }
  }

  Future<String?> _reconcileFromOrderBook({
    required String tradingsymbol,
    required String transactiontype,
    required int quantity,
  }) async {
    final book = await fetchOrderBook();
    if (book.isEmpty) return null;
    final wantSymbol = tradingsymbol.trim().toUpperCase();
    final wantTx = transactiontype.trim().toUpperCase();
    for (final row in book) {
      final sym = row['tradingsymbol']?.toString().trim().toUpperCase() ?? '';
      if (sym != wantSymbol) continue;
      final tx = row['transactiontype']?.toString().trim().toUpperCase() ?? '';
      if (tx != wantTx) continue;
      final brokerStatus =
          (row['status'] ?? row['orderstatus'] ?? '').toString();
      if (brokerStatus.toLowerCase().contains('reject') ||
          brokerStatus.toLowerCase().contains('cancel')) {
        continue;
      }
      final rowQty = int.tryParse(row['quantity']?.toString() ?? '') ?? 0;
      if (rowQty > 0 && rowQty != quantity) continue;
      final id = parseMstockOrderId({'data': row});
      if (id != null && id.isNotEmpty) return id;
    }
    return null;
  }

  Future<List<Map<String, dynamic>>> fetchOrderBook() async {
    final apiKey = StrategyResearchApiKeys.apiKey;
    final jwt = StrategyResearchApiKeys.jwtToken;
    if (!hasMstockSessionJwt(jwt, apiKey)) return [];

    final uri = Uri.parse(
      '${StrategyResearchApiKeys.baseUrl}${StrategyResearchApiKeys.ordersPath}',
    );
    final headers = mstockQuoteHeaders(apiKey, jwt);
    try {
      var response =
          await _client.get(uri, headers: headers).timeout(const Duration(seconds: 15));
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
              .timeout(const Duration(seconds: 15));
        }
      }
      if (response.statusCode != 200) return [];
      final json = jsonDecode(response.body) as Map<String, dynamic>?;
      if (!isMstockResponseOk(json)) return [];
      final data = json?['data'] ?? json?['Data'];
      if (data is List) {
        return data
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      return [];
    } catch (_) {
      return [];
    }
  }
}
