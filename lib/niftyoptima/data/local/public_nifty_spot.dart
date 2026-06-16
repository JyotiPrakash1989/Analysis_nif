import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../domain/entities/niftyoptima_models.dart';

/// Delayed NIFTY 50 from Yahoo ^NSEI when mStock Type B is unavailable.
class PublicNiftySpot {
  PublicNiftySpot({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  static const _chartUrl =
      'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1m&range=1d';

  Future<({
    double? ltp,
    List<MinuteBar> bars,
    double? previousClose,
    String error,
  })> fetchIntraday() async {
    try {
      final res = await _client
          .get(
            Uri.parse(_chartUrl),
            headers: const {
              'User-Agent': 'Mozilla/5.0 (compatible; NiftyOptima/1.0)',
              'Accept': 'application/json',
            },
          )
          .timeout(const Duration(seconds: 12));

      if (res.statusCode != 200) {
        return (
          ltp: null,
          bars: <MinuteBar>[],
          previousClose: null,
          error: 'Public NIFTY: HTTP ${res.statusCode}',
        );
      }

      final json = jsonDecode(res.body) as Map<String, dynamic>?;
      final result = (json?['chart'] as Map?)?['result'];
      if (result is! List || result.isEmpty) {
        return (
          ltp: null,
          bars: <MinuteBar>[],
          previousClose: null,
          error: 'Public NIFTY: empty chart',
        );
      }

      final r = result.first as Map<String, dynamic>;
      final meta = r['meta'] as Map<String, dynamic>? ?? {};
      final timestamps = r['timestamp'] as List? ?? [];
      final quote = (r['indicators'] as Map?)?['quote'];
      final q0 = quote is List && quote.isNotEmpty ? quote.first as Map? : null;
      final opens = (q0?['open'] as List?) ?? [];
      final highs = (q0?['high'] as List?) ?? [];
      final lows = (q0?['low'] as List?) ?? [];
      final closes = (q0?['close'] as List?) ?? [];

      final bars = <MinuteBar>[];
      final len = [timestamps.length, opens.length, highs.length, lows.length, closes.length]
          .reduce((a, b) => a < b ? a : b);

      for (var i = 0; i < len; i++) {
        final ts = timestamps[i];
        final open = _finite(opens[i]);
        final high = _finite(highs[i]);
        final low = _finite(lows[i]);
        final close = _finite(closes[i]);
        if (ts == null || open == null || high == null || low == null || close == null) {
          continue;
        }
        final time = ts is num ? (ts > 1e12 ? ts.toInt() : (ts * 1000).toInt()) : 0;
        bars.add(MinuteBar(time: time, open: open, high: high, low: low, close: close));
      }
      bars.sort((a, b) => a.time.compareTo(b.time));

      var ltp = _finite(meta['regularMarketPrice']) ?? _finite(meta['previousClose']);
      if (bars.isNotEmpty) {
        ltp = bars.last.close;
      } else {
        for (var i = closes.length - 1; i >= 0; i--) {
          final c = _finite(closes[i]);
          if (c != null) {
            ltp = c;
            break;
          }
        }
      }

      final previousClose =
          _finite(meta['chartPreviousClose']) ?? _finite(meta['previousClose']);

      if (ltp == null) {
        return (
          ltp: null,
          bars: bars,
          previousClose: previousClose,
          error: 'Public NIFTY: no price in response',
        );
      }
      return (ltp: ltp, bars: bars, previousClose: previousClose, error: '');
    } catch (e) {
      return (
        ltp: null,
        bars: <MinuteBar>[],
        previousClose: null,
        error: e.toString(),
      );
    }
  }

  double? _finite(dynamic v) {
    if (v is num && v.isFinite) return v.toDouble();
    return null;
  }
}

bool isMstockIpMismatch(String? text) {
  if (text == null || text.isEmpty) return false;
  return RegExp(
    r'IA403|ip address are not matching|Primary and Secondary IP',
    caseSensitive: false,
  ).hasMatch(text);
}

String mstockIpWhitelistHint() =>
    'Whitelist this device\'s public IP on trade.mstock.com → Trading APIs → '
    'Primary IP (check api.ipify.org on the phone). Mobile data uses a different IP than your PC.';
