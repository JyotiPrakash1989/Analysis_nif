import '../../domain/entities/niftyoptima_models.dart';
import 'local_market_helpers.dart';

/// Completed or forming 15×1m aggregate bar (mirrors stat_react FifteenBar).
class FifteenBar {
  const FifteenBar({
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.start,
    required this.end,
  });

  final double open;
  final double high;
  final double low;
  final double close;
  final int start;
  final int end;
}

class StrategyRules {
  const StrategyRules({this.ce, this.pe});

  final StrategyRuleLeg? ce;
  final StrategyRuleLeg? pe;
}

class BreakoutContext {
  const BreakoutContext({
    required this.rsi,
    required this.prior15,
    required this.current15,
    required this.side,
    required this.prevClose,
    required this.rules,
  });

  final double? rsi;
  final FifteenBar? prior15;
  final FifteenBar? current15;
  final String? side;
  final double? prevClose;
  final StrategyRules rules;
}

/// Stricter RSI gates — same as stat_react/server/analysis.mjs.
const ceRsiBreakoutMin = 62.0;
const peRsiBreakoutMax = 38.0;

/// Wilder-style RSI on closes (matches Node analysis.mjs).
double? computeWilderRsi(List<double> closes, {int period = 14}) {
  if (closes.length < period + 1) return null;
  var avgGain = 0.0;
  var avgLoss = 0.0;
  for (var i = 1; i <= period; i++) {
    final ch = closes[i] - closes[i - 1];
    if (ch >= 0) {
      avgGain += ch;
    } else {
      avgLoss -= ch;
    }
  }
  avgGain /= period;
  avgLoss /= period;
  for (var i = period + 1; i < closes.length; i++) {
    final ch = closes[i] - closes[i - 1];
    final g = ch > 0 ? ch : 0.0;
    final l = ch < 0 ? -ch : 0.0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss == 0) return 100;
  final rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

({FifteenBar? prior, FifteenBar? current}) aggregate15mFrom1m(
  List<MinuteBar> oneMinuteBars,
) {
  if (oneMinuteBars.length < 32) return (prior: null, current: null);
  final closed = oneMinuteBars.sublist(0, oneMinuteBars.length - 1);
  if (closed.length < 31) return (prior: null, current: null);

  FifteenBar? agg(List<MinuteBar> chunk) {
    if (chunk.isEmpty) return null;
    var high = double.negativeInfinity;
    var low = double.infinity;
    for (final b in chunk) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
    }
    return FifteenBar(
      open: chunk.first.open,
      high: high,
      low: low,
      close: chunk.last.close,
      start: chunk.first.time,
      end: chunk.last.time,
    );
  }

  final n = closed.length;
  final prior = agg(closed.sublist(n - 30, n - 15));
  final current = agg(closed.sublist(n - 15));
  return (prior: prior, current: current);
}

/// SL = tighter of 85% entry vs signal-candle option low; TGT = entry + 2× risk.
({double sl, double tgt, double risk}) calculateLevels(
  double entry,
  double signalCandleLowOption,
) {
  final slFromPremiumPct = entry * 0.85;
  final sl = slFromPremiumPct > signalCandleLowOption
      ? slFromPremiumPct
      : signalCandleLowOption;
  final risk = (entry - sl) > entry * 0.01 ? (entry - sl) : entry * 0.01;
  final tgt = entry + risk * 2;
  double r2(double v) => (v * 100).roundToDouble() / 100;
  return (sl: r2(sl), tgt: r2(tgt), risk: r2(risk));
}

String? breakoutSide(
  double niftySpot,
  double prior15High,
  double prior15Low,
  double prevClose,
  double rsi,
) {
  final brokeUp = niftySpot > prior15High && prevClose <= prior15High;
  final brokeDown = niftySpot < prior15Low && prevClose >= prior15Low;
  if (brokeUp && rsi > ceRsiBreakoutMin) return 'CE';
  if (brokeDown && rsi < peRsiBreakoutMax) return 'PE';
  return null;
}

BreakoutContext evaluateBreakoutContext(List<MinuteBar> oneMinuteBars, double spot) {
  const empty = BreakoutContext(
    rsi: null,
    prior15: null,
    current15: null,
    side: null,
    prevClose: null,
    rules: StrategyRules(),
  );
  if (oneMinuteBars.isEmpty || !spot.isFinite) return empty;

  final closes = oneMinuteBars.map((b) => b.close).toList();
  final rsiRaw = computeWilderRsi(closes);
  final closed =
      oneMinuteBars.length >= 2 ? oneMinuteBars.sublist(0, oneMinuteBars.length - 1) : oneMinuteBars;
  final prevClose = closed.isNotEmpty ? closed.last.close : spot;
  final agg = aggregate15mFrom1m(oneMinuteBars);
  final prior = agg.prior;

  if (prior == null || rsiRaw == null) {
    return BreakoutContext(
      rsi: rsiRaw == null ? null : (rsiRaw * 100).roundToDouble() / 100,
      prior15: prior,
      current15: agg.current,
      side: null,
      prevClose: prevClose,
      rules: const StrategyRules(),
    );
  }

  final rsi = (rsiRaw * 100).roundToDouble() / 100;
  final brokeUp = spot > prior.high && prevClose <= prior.high;
  final brokeDown = spot < prior.low && prevClose >= prior.low;
  final rsiCeOk = rsi > ceRsiBreakoutMin;
  final rsiPeOk = rsi < peRsiBreakoutMax;
  final rules = StrategyRules(
    ce: StrategyRuleLeg(
      brokeUp: brokeUp,
      rsiOk: rsiCeOk,
      ready: brokeUp && rsiCeOk,
      priorHigh: prior.high,
      rsiMin: ceRsiBreakoutMin,
    ),
    pe: StrategyRuleLeg(
      brokeDown: brokeDown,
      rsiOk: rsiPeOk,
      ready: brokeDown && rsiPeOk,
      priorLow: prior.low,
      rsiMax: peRsiBreakoutMax,
    ),
  );
  final side = breakoutSide(spot, prior.high, prior.low, prevClose, rsi);

  return BreakoutContext(
    rsi: rsi,
    prior15: prior,
    current15: agg.current,
    side: side,
    prevClose: prevClose,
    rules: rules,
  );
}

/// Build ATM breakout signal from option chain LTP (same rules as stat_react).
SignalPayload? buildBreakoutSignal({
  required String side,
  required double spot,
  required double? rsi,
  required List<OptionChainRow> chainRows,
  int ts = 0,
}) {
  final atm = atmStrikeFromSpot(spot);
  final chain = chainRows.isNotEmpty ? chainRows : buildSimulatedOptionChain(spot);
  OptionChainRow? row;
  for (final r in chain) {
    if (r.strike == atm) {
      row = r;
      break;
    }
  }
  row ??= chain.isNotEmpty ? chain[chain.length ~/ 2] : null;
  if (row == null) return null;

  final entry = side == 'CE' ? row.ce.ltp : row.pe.ltp;
  if (!entry.isFinite || entry <= 0) return null;

  final signalCandleLowOption = entry * 0.9;
  final levels = calculateLevels(entry, signalCandleLowOption);
  final rsiLabel = rsi?.toStringAsFixed(1) ?? '—';
  final now = ts > 0 ? ts : DateTime.now().millisecondsSinceEpoch;

  return SignalPayload(
    side: side,
    strike: atm,
    optionType: side,
    entry: entry,
    sl: levels.sl,
    tgt: levels.tgt,
    risk: levels.risk,
    rationale: '15m ${side == 'CE' ? 'high' : 'low'} breakout with RSI $rsiLabel',
    ts: now,
  );
}
