import '../../domain/entities/niftyoptima_models.dart';
import 'breakout_analysis.dart';
import 'local_order_store.dart';

/// Minimum composite score (0–100) to emit a buy signal — same as stat_react.
const minDailyScore = 92.0;

const ceRsiMin = 62.0;
const peRsiMax = 38.0;

String istDateKey([DateTime? now]) => LocalOrderStore.istDayKey(now);

String signalWindowKey(String dayKey, String side, FifteenBar? prior15) {
  final windowEnd = prior15?.end ?? 0;
  return '$dayKey-$side-$windowEnd';
}

double scoreCeSetup(
  double spot,
  FifteenBar prior,
  double rsi,
  double prevClose,
) {
  final brokeUp = spot > prior.high && prevClose <= prior.high;
  if (!brokeUp || rsi < ceRsiMin) return 0;

  var score = 0.0;
  score += ((rsi - ceRsiMin) / (100 - ceRsiMin) * 35).clamp(0, 35);

  final pointsBeyond = spot - prior.high;
  score += (pointsBeyond * 2.5).clamp(0, 25);

  final range = prior.high - prior.low;
  if (range > 0) {
    final pos = (spot - prior.low) / range;
    score += pos >= 0.65 ? 20 : pos * 15;
  }

  if (prevClose <= prior.high) score += 10;
  if (brokeUp && rsi >= 75 && pointsBeyond >= 10) score += 5;
  return ((score.clamp(0, 100) * 10).roundToDouble()) / 10;
}

double scorePeSetup(
  double spot,
  FifteenBar prior,
  double rsi,
  double prevClose,
) {
  final brokeDown = spot < prior.low && prevClose >= prior.low;
  if (!brokeDown || rsi > peRsiMax) return 0;

  var score = 0.0;
  score += ((peRsiMax - rsi) / peRsiMax * 35).clamp(0, 35);

  final pointsBeyond = prior.low - spot;
  score += (pointsBeyond * 2.5).clamp(0, 25);

  final range = prior.high - prior.low;
  if (range > 0) {
    final pos = (prior.high - spot) / range;
    score += pos >= 0.65 ? 20 : pos * 15;
  }

  if (prevClose >= prior.low) score += 10;
  if (brokeDown && rsi <= 30 && pointsBeyond >= 10) score += 5;
  return ((score.clamp(0, 100) * 10).roundToDouble()) / 10;
}

class DailyBuyContext {
  const DailyBuyContext({
    required this.rsi,
    required this.prior15,
    required this.prevClose,
    required this.rules,
    this.side,
  });

  final double? rsi;
  final FifteenBar? prior15;
  final double? prevClose;
  final StrategyRules rules;
  final String? side;
}

class DailyBuyPick {
  const DailyBuyPick({required this.side, required this.score});

  final String side;
  final double score;
}

DailyBuyPick? pickBestSideForDay(DailyBuyContext ctx, double spot) {
  final prior = ctx.prior15;
  final rsi = ctx.rsi;
  final prevClose = ctx.prevClose ?? spot;
  if (prior == null || rsi == null) return null;

  final ceScore = scoreCeSetup(spot, prior, rsi, prevClose);
  final peScore = scorePeSetup(spot, prior, rsi, prevClose);
  final ceReady = ctx.rules.ce?.ready == true;
  final peReady = ctx.rules.pe?.ready == true;

  String? side;
  var score = 0.0;

  if (ceScore >= minDailyScore && peScore >= minDailyScore) {
    if (ceScore >= peScore) {
      side = 'CE';
      score = ceScore;
    } else {
      side = 'PE';
      score = peScore;
    }
  } else if (ceScore >= minDailyScore && ceScore >= peScore) {
    side = 'CE';
    score = ceScore;
  } else if (peScore >= minDailyScore && peScore > ceScore) {
    side = 'PE';
    score = peScore;
  } else if (ceReady && ceScore >= peScore && ceScore >= minDailyScore) {
    side = 'CE';
    score = ceScore;
  } else if (peReady && peScore > ceScore && peScore >= minDailyScore) {
    side = 'PE';
    score = peScore;
  }

  if (side == null || score < minDailyScore) return null;
  return DailyBuyPick(side: side, score: score);
}

class DailyBuyState {
  const DailyBuyState({
    this.dayKey = '',
    this.emittedKeys = const [],
    this.signalsToday = 0,
    this.lastSignal,
    this.ceScore = 0,
    this.peScore = 0,
  });

  final String dayKey;
  final List<String> emittedKeys;
  final int signalsToday;
  final SignalPayload? lastSignal;
  final double ceScore;
  final double peScore;

  DailyBuyState copyWith({
    String? dayKey,
    List<String>? emittedKeys,
    int? signalsToday,
    SignalPayload? lastSignal,
    double? ceScore,
    double? peScore,
  }) {
    return DailyBuyState(
      dayKey: dayKey ?? this.dayKey,
      emittedKeys: emittedKeys ?? this.emittedKeys,
      signalsToday: signalsToday ?? this.signalsToday,
      lastSignal: lastSignal ?? this.lastSignal,
      ceScore: ceScore ?? this.ceScore,
      peScore: peScore ?? this.peScore,
    );
  }
}

class DailyBestBuyResult {
  const DailyBestBuyResult({
    this.signal,
    required this.dayKey,
    required this.isNewSignal,
    required this.suppressedByPosition,
    this.holdSuggestion,
    required this.ceScore,
    required this.peScore,
    required this.signalsToday,
    required this.emittedKeys,
    this.lastSignal,
    required this.hasOpenPosition,
  });

  final SignalPayload? signal;
  final String dayKey;
  final bool isNewSignal;
  final bool suppressedByPosition;
  final HoldSuggestion? holdSuggestion;
  final double ceScore;
  final double peScore;
  final int signalsToday;
  final List<String> emittedKeys;
  final SignalPayload? lastSignal;
  final bool hasOpenPosition;
}

DailyBestBuyResult resolveDailyBestBuy({
  DailyBuyState? state,
  DateTime? now,
  required double? spot,
  required DailyBuyContext? ctx,
  List<OptionChainRow> chainRows = const [],
  bool hasOpenPosition = false,
  OrderLogEntry? openPosition,
}) {
  final ts = (now ?? DateTime.now()).millisecondsSinceEpoch;
  final dayKey = istDateKey(now);
  final emittedKeys = state?.dayKey == dayKey
      ? List<String>.from(state!.emittedKeys)
      : <String>[];
  final signalsToday =
      state?.dayKey == dayKey ? state!.signalsToday : 0;
  final lastSignal =
      state?.dayKey == dayKey ? state!.lastSignal : null;

  final empty = DailyBestBuyResult(
    dayKey: dayKey,
    isNewSignal: false,
    suppressedByPosition: false,
    ceScore: 0,
    peScore: 0,
    signalsToday: signalsToday,
    emittedKeys: emittedKeys,
    lastSignal: lastSignal,
    hasOpenPosition: hasOpenPosition,
  );

  if (spot == null || !spot.isFinite || ctx == null) return empty;

  final prior = ctx.prior15;
  final rsi = ctx.rsi;
  final prevClose = ctx.prevClose ?? spot;
  if (prior == null || rsi == null) return empty;

  final ceScore = scoreCeSetup(spot, prior, rsi, prevClose);
  final peScore = scorePeSetup(spot, prior, rsi, prevClose);
  final pick = pickBestSideForDay(ctx, spot);

  if (pick == null || pick.score < minDailyScore) {
    return DailyBestBuyResult(
      dayKey: dayKey,
      isNewSignal: false,
      suppressedByPosition: false,
      ceScore: ceScore,
      peScore: peScore,
      signalsToday: signalsToday,
      emittedKeys: emittedKeys,
      lastSignal: lastSignal,
      hasOpenPosition: hasOpenPosition,
    );
  }

  final windowKey = signalWindowKey(dayKey, pick.side, prior);
  final alreadyEmitted = emittedKeys.contains(windowKey);

  final base = buildBreakoutSignal(
    side: pick.side,
    spot: spot,
    rsi: rsi,
    chainRows: chainRows,
    ts: ts,
  );
  if (base == null) {
    return DailyBestBuyResult(
      dayKey: dayKey,
      isNewSignal: false,
      suppressedByPosition: false,
      ceScore: ceScore,
      peScore: peScore,
      signalsToday: signalsToday,
      emittedKeys: emittedKeys,
      lastSignal: lastSignal,
      hasOpenPosition: hasOpenPosition,
    );
  }

  final candidate = SignalPayload(
    side: base.side,
    strike: base.strike,
    optionType: base.optionType,
    entry: base.entry,
    sl: base.sl,
    tgt: base.tgt,
    risk: base.risk,
    rationale:
        'Best ${pick.side} setup (${pick.score.round()}% score) · ${base.rationale}',
    ts: base.ts,
    dailyPick: true,
    confidence: pick.score.roundToDouble(),
    signalIndex: alreadyEmitted ? signalsToday : signalsToday + 1,
  );

  if (hasOpenPosition) {
    final pos = openPosition;
    final holdSuggestion = HoldSuggestion(
      ts: ts,
      strike: pos?.strike ?? candidate.strike,
      optionType: pos?.optionType ?? candidate.optionType,
      entry: pos?.entry ?? candidate.entry,
      sl: pos?.sl ?? candidate.sl,
      tgt: pos?.tgt ?? candidate.tgt,
      suppressedSide: pick.side,
      suppressedScore: pick.score.roundToDouble(),
      reason: alreadyEmitted ? 'position_open' : 'new_setup_while_holding',
    );
    return DailyBestBuyResult(
      dayKey: dayKey,
      isNewSignal: false,
      suppressedByPosition: true,
      holdSuggestion: alreadyEmitted ? null : holdSuggestion,
      ceScore: ceScore,
      peScore: peScore,
      signalsToday: signalsToday,
      emittedKeys: emittedKeys,
      lastSignal: lastSignal,
      hasOpenPosition: true,
    );
  }

  if (alreadyEmitted) {
    return DailyBestBuyResult(
      signal: lastSignal,
      dayKey: dayKey,
      isNewSignal: false,
      suppressedByPosition: false,
      ceScore: ceScore,
      peScore: peScore,
      signalsToday: signalsToday,
      emittedKeys: emittedKeys,
      lastSignal: lastSignal,
      hasOpenPosition: false,
    );
  }

  final signal = SignalPayload(
    side: candidate.side,
    strike: candidate.strike,
    optionType: candidate.optionType,
    entry: candidate.entry,
    sl: candidate.sl,
    tgt: candidate.tgt,
    risk: candidate.risk,
    rationale:
        'Strategy ${signalsToday + 1} today · ${candidate.rationale}',
    ts: candidate.ts,
    dailyPick: true,
    confidence: candidate.confidence,
    signalIndex: signalsToday + 1,
  );

  return DailyBestBuyResult(
    signal: signal,
    dayKey: dayKey,
    isNewSignal: true,
    suppressedByPosition: false,
    ceScore: ceScore,
    peScore: peScore,
    signalsToday: signalsToday + 1,
    emittedKeys: [...emittedKeys, windowKey],
    lastSignal: signal,
    hasOpenPosition: false,
  );
}

/// Open BUY row for today without a closing SELL (mirrors server openPositionsFromLogs).
OrderLogEntry? openPositionForDay(String dayKey) {
  final logs = LocalOrderStore.instance.logsForDay(dayKey);
  final buys = logs.where((l) => l.action == 'BUY').toList();
  for (var i = buys.length - 1; i >= 0; i--) {
    final buy = buys[i];
    if (buy.status == 'failed') continue;
    final orderId = buy.orderId ?? buy.id;
    final hasExit = logs.any(
      (l) => l.action == 'SELL' && l.parentBuyId == orderId,
    );
    if (!hasExit) return buy;
  }
  return null;
}

DailyBuyContext dailyBuyContextFromBreakout(BreakoutContext ctx) {
  return DailyBuyContext(
    rsi: ctx.rsi,
    prior15: ctx.prior15,
    prevClose: ctx.prevClose,
    rules: ctx.rules,
    side: ctx.side,
  );
}
