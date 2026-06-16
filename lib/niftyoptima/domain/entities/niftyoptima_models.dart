import '../../../nifty_alpha/domain/models/analytics_snapshot.dart';

/// Intraday NIFTY move vs previous close (mirrors stat_react TickPayload).
class NiftyDayChange {
  const NiftyDayChange({
    required this.prevClose,
    this.dayOpen,
    required this.points,
    required this.percent,
    required this.basis,
  });

  final double prevClose;
  final double? dayOpen;
  final double points;
  final double percent;
  final String basis;

  factory NiftyDayChange.fromJson(Map<String, dynamic> j) {
    return NiftyDayChange(
      prevClose: _num(j['prevClose']),
      dayOpen: j['dayOpen'] == null ? null : _num(j['dayOpen']),
      points: _num(j['points']),
      percent: _num(j['percent']),
      basis: j['basis']?.toString() ?? 'prevClose',
    );
  }
}

class MinuteBar {
  const MinuteBar({
    required this.time,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
  });

  final int time;
  final double open;
  final double high;
  final double low;
  final double close;

  factory MinuteBar.fromJson(Map<String, dynamic> j) {
    return MinuteBar(
      time: _int(j['time']),
      open: _num(j['open']),
      high: _num(j['high']),
      low: _num(j['low']),
      close: _num(j['close']),
    );
  }
}

class OptionLeg {
  const OptionLeg({
    required this.ltp,
    required this.oiChangePct,
    required this.volume,
  });

  final double ltp;
  final double oiChangePct;
  final double volume;

  factory OptionLeg.fromJson(Map<String, dynamic> j) {
    return OptionLeg(
      ltp: _num(j['ltp']),
      oiChangePct: _num(j['oiChangePct']),
      volume: _num(j['volume']),
    );
  }
}

class OptionChainRow {
  const OptionChainRow({
    required this.strike,
    required this.ce,
    required this.pe,
  });

  final int strike;
  final OptionLeg ce;
  final OptionLeg pe;

  factory OptionChainRow.fromJson(Map<String, dynamic> j) {
    return OptionChainRow(
      strike: _int(j['strike']),
      ce: OptionLeg.fromJson(Map<String, dynamic>.from(j['ce'] as Map? ?? {})),
      pe: OptionLeg.fromJson(Map<String, dynamic>.from(j['pe'] as Map? ?? {})),
    );
  }
}

class StrategyRuleLeg {
  const StrategyRuleLeg({
    this.brokeUp,
    this.brokeDown,
    required this.rsiOk,
    required this.ready,
    this.priorHigh,
    this.priorLow,
    this.rsiMin,
    this.rsiMax,
  });

  final bool? brokeUp;
  final bool? brokeDown;
  final bool rsiOk;
  final bool ready;
  final double? priorHigh;
  final double? priorLow;
  final double? rsiMin;
  final double? rsiMax;

  factory StrategyRuleLeg.fromJson(Map<String, dynamic> j) {
    return StrategyRuleLeg(
      brokeUp: j['brokeUp'] as bool?,
      brokeDown: j['brokeDown'] as bool?,
      rsiOk: j['rsiOk'] == true,
      ready: j['ready'] == true,
      priorHigh: j['priorHigh'] == null ? null : _num(j['priorHigh']),
      priorLow: j['priorLow'] == null ? null : _num(j['priorLow']),
      rsiMin: j['rsiMin'] == null ? null : _num(j['rsiMin']),
      rsiMax: j['rsiMax'] == null ? null : _num(j['rsiMax']),
    );
  }
}

class SignalPayload {
  const SignalPayload({
    required this.side,
    required this.strike,
    required this.optionType,
    required this.entry,
    required this.sl,
    required this.tgt,
    required this.risk,
    required this.rationale,
    required this.ts,
    this.dailyPick,
    this.confidence,
    this.signalIndex,
  });

  final String side;
  final int strike;
  final String optionType;
  final double entry;
  final double sl;
  final double tgt;
  final double risk;
  final String rationale;
  final int ts;
  final bool? dailyPick;
  final double? confidence;
  final int? signalIndex;

  factory SignalPayload.fromJson(Map<String, dynamic> j) {
    return SignalPayload(
      side: j['side']?.toString() ?? j['optionType']?.toString() ?? 'CE',
      strike: _int(j['strike']),
      optionType: j['optionType']?.toString() ?? 'CE',
      entry: _num(j['entry']),
      sl: _num(j['sl']),
      tgt: _num(j['tgt']),
      risk: _num(j['risk']),
      rationale: j['rationale']?.toString() ?? '',
      ts: _int(j['ts']),
      dailyPick: j['dailyPick'] as bool?,
      confidence: j['confidence'] == null ? null : _num(j['confidence']),
      signalIndex: j['signalIndex'] == null ? null : _int(j['signalIndex']),
    );
  }
}

class HoldSuggestion {
  const HoldSuggestion({
    required this.ts,
    required this.strike,
    required this.optionType,
    required this.entry,
    required this.sl,
    required this.tgt,
    required this.reason,
    this.suppressedSide,
    this.suppressedScore,
  });

  final int ts;
  final int strike;
  final String optionType;
  final double entry;
  final double sl;
  final double tgt;
  final String reason;
  final String? suppressedSide;
  final double? suppressedScore;

  factory HoldSuggestion.fromJson(Map<String, dynamic> j) {
    return HoldSuggestion(
      ts: _int(j['ts']),
      strike: _int(j['strike']),
      optionType: j['optionType']?.toString() ?? 'CE',
      entry: _num(j['entry']),
      sl: _num(j['sl']),
      tgt: _num(j['tgt']),
      reason: j['reason']?.toString() ?? '',
      suppressedSide: j['suppressedSide']?.toString(),
      suppressedScore:
          j['suppressedScore'] == null ? null : _num(j['suppressedScore']),
    );
  }
}

class DailyBestBuy {
  const DailyBestBuy({
    this.confidence,
    required this.ceScore,
    required this.peScore,
    required this.dayKey,
    required this.signalsToday,
    this.signal,
    this.suppressedByPosition,
    this.hasOpenPosition,
    this.holdSuggestion,
  });

  final double? confidence;
  final double ceScore;
  final double peScore;
  final String dayKey;
  final int signalsToday;
  final SignalPayload? signal;
  final bool? suppressedByPosition;
  final bool? hasOpenPosition;
  final HoldSuggestion? holdSuggestion;

  factory DailyBestBuy.fromJson(Map<String, dynamic> j) {
    return DailyBestBuy(
      confidence: j['confidence'] == null ? null : _num(j['confidence']),
      ceScore: _num(j['ceScore']),
      peScore: _num(j['peScore']),
      dayKey: j['dayKey']?.toString() ?? '',
      signalsToday: _int(j['signalsToday']),
      signal: j['signal'] is Map
          ? SignalPayload.fromJson(Map<String, dynamic>.from(j['signal'] as Map))
          : null,
      suppressedByPosition: j['suppressedByPosition'] as bool?,
      hasOpenPosition: j['hasOpenPosition'] as bool?,
      holdSuggestion: j['holdSuggestion'] is Map
          ? HoldSuggestion.fromJson(
              Map<String, dynamic>.from(j['holdSuggestion'] as Map),
            )
          : null,
    );
  }
}

class TickPayload {
  const TickPayload({
    required this.ts,
    required this.spot,
    this.dayChange,
    this.rsi,
    required this.atm,
    required this.optionChain,
    this.optionChainExpiry,
    required this.sentiment,
    required this.bars1m,
    this.indexSource,
    this.indexError,
    this.indexFromLastCandle,
    this.strategyRules,
    this.dailyBestBuy,
  });

  final int ts;
  final double spot;
  final NiftyDayChange? dayChange;
  final double? rsi;
  final int atm;
  final List<OptionChainRow> optionChain;
  final String? optionChainExpiry;
  final double sentiment;
  final List<MinuteBar> bars1m;
  final String? indexSource;
  final String? indexError;
  final bool? indexFromLastCandle;
  final Map<String, StrategyRuleLeg?>? strategyRules;
  final DailyBestBuy? dailyBestBuy;

  factory TickPayload.fromJson(Map<String, dynamic> j) {
    final rulesRaw = j['strategyRules'];
    Map<String, StrategyRuleLeg?>? rules;
    if (rulesRaw is Map) {
      rules = {
        'ce': rulesRaw['ce'] is Map
            ? StrategyRuleLeg.fromJson(
                Map<String, dynamic>.from(rulesRaw['ce'] as Map),
              )
            : null,
        'pe': rulesRaw['pe'] is Map
            ? StrategyRuleLeg.fromJson(
                Map<String, dynamic>.from(rulesRaw['pe'] as Map),
              )
            : null,
      };
    }
    return TickPayload(
      ts: _int(j['ts']),
      spot: _num(j['spot']),
      dayChange: j['dayChange'] is Map
          ? NiftyDayChange.fromJson(
              Map<String, dynamic>.from(j['dayChange'] as Map),
            )
          : null,
      rsi: j['rsi'] == null ? null : _num(j['rsi']),
      atm: _int(j['atm']),
      optionChain: _list(j['optionChain'], OptionChainRow.fromJson),
      optionChainExpiry: j['optionChainExpiry']?.toString(),
      sentiment: _num(j['sentiment']),
      bars1m: _list(j['bars1m'], MinuteBar.fromJson),
      indexSource: j['indexSource']?.toString(),
      indexError: j['indexError']?.toString(),
      indexFromLastCandle: j['indexFromLastCandle'] as bool?,
      strategyRules: rules,
      dailyBestBuy: j['dailyBestBuy'] is Map
          ? DailyBestBuy.fromJson(
              Map<String, dynamic>.from(j['dailyBestBuy'] as Map),
            )
          : null,
    );
  }
}

class NiftySpotRest {
  const NiftySpotRest({
    this.spot,
    this.dayChange,
    this.atm,
    required this.optionChain,
    this.optionChainExpiry,
    this.chainSource,
    required this.bars1m,
    this.rsi,
    this.strategyRules,
    required this.indexSource,
    required this.indexError,
    required this.indexFromLastCandle,
    required this.polledAt,
    this.ipBlocked,
    this.whitelistIp,
  });

  final double? spot;
  final NiftyDayChange? dayChange;
  final int? atm;
  final List<OptionChainRow> optionChain;
  final String? optionChainExpiry;
  final String? chainSource;
  final List<MinuteBar> bars1m;
  final double? rsi;
  final Map<String, StrategyRuleLeg?>? strategyRules;
  final String indexSource;
  final String indexError;
  final bool indexFromLastCandle;
  final int polledAt;
  final bool? ipBlocked;
  final String? whitelistIp;

  factory NiftySpotRest.fromJson(Map<String, dynamic> j) {
    final rulesRaw = j['strategyRules'];
    Map<String, StrategyRuleLeg?>? rules;
    if (rulesRaw is Map) {
      rules = {
        'ce': rulesRaw['ce'] is Map
            ? StrategyRuleLeg.fromJson(
                Map<String, dynamic>.from(rulesRaw['ce'] as Map),
              )
            : null,
        'pe': rulesRaw['pe'] is Map
            ? StrategyRuleLeg.fromJson(
                Map<String, dynamic>.from(rulesRaw['pe'] as Map),
              )
            : null,
      };
    }
    return NiftySpotRest(
      spot: j['spot'] == null ? null : _num(j['spot']),
      dayChange: j['dayChange'] is Map
          ? NiftyDayChange.fromJson(
              Map<String, dynamic>.from(j['dayChange'] as Map),
            )
          : null,
      atm: j['atm'] == null ? null : _int(j['atm']),
      optionChain: _list(j['optionChain'], OptionChainRow.fromJson),
      optionChainExpiry: j['optionChainExpiry']?.toString(),
      chainSource: j['chainSource']?.toString(),
      bars1m: _list(j['bars1m'], MinuteBar.fromJson),
      rsi: j['rsi'] == null ? null : _num(j['rsi']),
      strategyRules: rules,
      indexSource: j['indexSource']?.toString() ?? 'mock',
      indexError: j['indexError']?.toString() ?? '',
      indexFromLastCandle: j['indexFromLastCandle'] == true,
      polledAt: _int(j['polledAt']),
      ipBlocked: j['ipBlocked'] as bool?,
      whitelistIp: j['whitelistIp']?.toString(),
    );
  }
}

class OrderLogEntry {
  const OrderLogEntry({
    required this.id,
    required this.ts,
    required this.dayKey,
    required this.action,
    required this.mode,
    required this.trigger,
    required this.strike,
    required this.optionType,
    required this.status,
    this.assetType,
    this.equitySymbol,
    this.lots,
    this.units,
    this.lotsize,
    this.entry,
    this.sl,
    this.tgt,
    this.exitPrice,
    this.ltp,
    this.orderId,
    this.parentBuyId,
    this.mock,
    this.message,
  });

  final String id;
  final int ts;
  final String dayKey;
  final String action;
  final String mode;
  final String trigger;
  final int strike;
  final String optionType;
  final String status;
  final String? assetType;
  final String? equitySymbol;
  final int? lots;
  final int? units;
  final int? lotsize;
  final double? entry;
  final double? sl;
  final double? tgt;
  final double? exitPrice;
  final double? ltp;
  final String? orderId;
  final String? parentBuyId;
  final bool? mock;
  final String? message;

  factory OrderLogEntry.fromJson(Map<String, dynamic> j) {
    return OrderLogEntry(
      id: j['id']?.toString() ?? '',
      ts: _int(j['ts']),
      dayKey: j['dayKey']?.toString() ?? '',
      action: j['action']?.toString() ?? '',
      mode: j['mode']?.toString() ?? 'manual',
      trigger: j['trigger']?.toString() ?? '',
      strike: _int(j['strike']),
      optionType: j['optionType']?.toString() ?? 'CE',
      status: j['status']?.toString() ?? '',
      assetType: j['assetType']?.toString(),
      equitySymbol: j['equitySymbol']?.toString(),
      lots: j['lots'] == null ? null : _int(j['lots']),
      units: j['units'] == null ? null : _int(j['units']),
      lotsize: j['lotsize'] == null ? null : _int(j['lotsize']),
      entry: j['entry'] == null ? null : _num(j['entry']),
      sl: j['sl'] == null ? null : _num(j['sl']),
      tgt: j['tgt'] == null ? null : _num(j['tgt']),
      exitPrice: j['exitPrice'] == null ? null : _num(j['exitPrice']),
      ltp: j['ltp'] == null ? null : _num(j['ltp']),
      orderId: j['orderId']?.toString(),
      parentBuyId: j['parentBuyId']?.toString(),
      mock: j['mock'] as bool?,
      message: j['message']?.toString(),
    );
  }
}

class OrderLogResponse {
  const OrderLogResponse({
    required this.day,
    required this.logs,
    this.autoTrading,
  });

  final String day;
  final List<OrderLogEntry> logs;
  final bool? autoTrading;

  factory OrderLogResponse.fromJson(Map<String, dynamic> j) {
    return OrderLogResponse(
      day: j['day']?.toString() ?? '',
      logs: _list(j['logs'], OrderLogEntry.fromJson),
      autoTrading: j['autoTrading'] as bool?,
    );
  }
}

class NiftyHistoryRest {
  const NiftyHistoryRest({
    required this.bars,
    required this.tradingDays,
    required this.indexSource,
    required this.indexError,
    required this.polledAt,
  });

  final List<MinuteBar> bars;
  final int tradingDays;
  final String indexSource;
  final String indexError;
  final int polledAt;

  factory NiftyHistoryRest.fromJson(Map<String, dynamic> j) {
    return NiftyHistoryRest(
      bars: _list(j['bars'], MinuteBar.fromJson),
      tradingDays: _int(j['tradingDays']),
      indexSource: j['indexSource']?.toString() ?? 'mock',
      indexError: j['indexError']?.toString() ?? '',
      polledAt: _int(j['polledAt']),
    );
  }
}

class EquityAnalysis {
  const EquityAnalysis({
    this.side,
    required this.suggestPurchase,
    this.entry,
    this.sl,
    this.tgt,
    this.confidence,
    required this.score,
    this.rationale,
    required this.factors,
  });

  final String? side;
  final bool suggestPurchase;
  final double? entry;
  final double? sl;
  final double? tgt;
  final double? confidence;
  final double score;
  final String? rationale;
  final List<String> factors;

  factory EquityAnalysis.fromJson(Map<String, dynamic> j) {
    return EquityAnalysis(
      side: j['side']?.toString(),
      suggestPurchase: j['suggestPurchase'] == true,
      entry: j['entry'] == null ? null : _num(j['entry']),
      sl: j['sl'] == null ? null : _num(j['sl']),
      tgt: j['tgt'] == null ? null : _num(j['tgt']),
      confidence: j['confidence'] == null ? null : _num(j['confidence']),
      score: _num(j['score']),
      rationale: j['rationale']?.toString(),
      factors: (j['factors'] as List?)?.map((e) => e.toString()).toList() ?? [],
    );
  }
}

class StockSnapshot {
  const StockSnapshot({
    required this.symbol,
    this.name,
    required this.ltp,
    required this.source,
    required this.error,
    required this.analysis,
    this.barsCount,
  });

  final String symbol;
  final String? name;
  final double ltp;
  final String source;
  final String error;
  final EquityAnalysis analysis;
  final int? barsCount;

  factory StockSnapshot.fromJson(Map<String, dynamic> j) {
    return StockSnapshot(
      symbol: j['symbol']?.toString() ?? '',
      name: j['name']?.toString(),
      ltp: _num(j['ltp']),
      source: j['source']?.toString() ?? '',
      error: j['error']?.toString() ?? '',
      analysis: EquityAnalysis.fromJson(
        Map<String, dynamic>.from(j['analysis'] as Map? ?? {}),
      ),
      barsCount: j['barsCount'] == null ? null : _int(j['barsCount']),
    );
  }
}

class RankedStock extends StockSnapshot {
  const RankedStock({
    required super.symbol,
    super.name,
    required super.ltp,
    required super.source,
    required super.error,
    required super.analysis,
    super.barsCount,
    required this.profitScore,
    required this.rewardPct,
  });

  final double profitScore;
  final double rewardPct;

  factory RankedStock.fromJson(Map<String, dynamic> j) {
    return RankedStock(
      symbol: j['symbol']?.toString() ?? '',
      name: j['name']?.toString(),
      ltp: _num(j['ltp']),
      source: j['source']?.toString() ?? '',
      error: j['error']?.toString() ?? '',
      analysis: EquityAnalysis.fromJson(
        Map<String, dynamic>.from(j['analysis'] as Map? ?? {}),
      ),
      barsCount: j['barsCount'] == null ? null : _int(j['barsCount']),
      profitScore: _num(j['profitScore']),
      rewardPct: _num(j['rewardPct']),
    );
  }
}

class EquityAnalyzeResponse {
  const EquityAnalyzeResponse({
    required this.stocks,
    required this.ranked,
    this.topPick,
    required this.analyzedAt,
    this.message,
  });

  final List<StockSnapshot> stocks;
  final List<RankedStock> ranked;
  final RankedStock? topPick;
  final int analyzedAt;
  final String? message;

  factory EquityAnalyzeResponse.fromJson(Map<String, dynamic> j) {
    return EquityAnalyzeResponse(
      stocks: _list(j['stocks'], StockSnapshot.fromJson),
      ranked: _list(j['ranked'], RankedStock.fromJson),
      topPick: j['topPick'] is Map
          ? RankedStock.fromJson(Map<String, dynamic>.from(j['topPick'] as Map))
          : null,
      analyzedAt: _int(j['analyzedAt']),
      message: j['message']?.toString(),
    );
  }
}

class WatchlistResponse {
  const WatchlistResponse({required this.symbols});

  final List<String> symbols;

  factory WatchlistResponse.fromJson(Map<String, dynamic> j) {
    return WatchlistResponse(
      symbols: (j['symbols'] as List?)?.map((e) => e.toString()).toList() ?? [],
    );
  }
}

/// Build analytics snapshot from option chain (stat_react chain data).
AnalyticsSnapshot? analyticsFromOptionChain(List<OptionChainRow> chain) {
  if (chain.isEmpty) return null;

  double ceOi = 0;
  double peOi = 0;
  final highlights = <OiHighlight>[];

  for (final row in chain) {
    ceOi += row.ce.oiChangePct.abs();
    peOi += row.pe.oiChangePct.abs();
    if (row.ce.oiChangePct.abs() >= 50) {
      highlights.add(OiHighlight(
        strike: row.strike,
        optionType: 'CE',
        oiChangePercent: row.ce.oiChangePct.roundToDouble(),
        label: row.ce.oiChangePct > 0 ? 'Long build-up' : 'Short covering',
      ));
    }
    if (row.pe.oiChangePct.abs() >= 50) {
      highlights.add(OiHighlight(
        strike: row.strike,
        optionType: 'PE',
        oiChangePercent: row.pe.oiChangePct.roundToDouble(),
        label: row.pe.oiChangePct > 0 ? 'Support build-up' : 'Unwinding',
      ));
    }
  }

  final pcr = ceOi > 0 ? peOi / ceOi : 1.0;
  final pcrZone = pcr > 1.2
      ? PcrZone.oversold
      : pcr < 0.8
          ? PcrZone.overbought
          : PcrZone.neutral;

  highlights.sort(
    (a, b) => b.oiChangePercent.abs().compareTo(a.oiChangePercent.abs()),
  );

  return AnalyticsSnapshot(
    pcr: double.parse(pcr.toStringAsFixed(2)),
    pcrZone: pcrZone,
    maxPainStrike: chain[chain.length ~/ 2].strike,
    oiHighlights: highlights.take(4).toList(),
  );
}

double _num(dynamic v) {
  if (v is num) return v.toDouble();
  return double.tryParse(v?.toString() ?? '') ?? 0;
}

int _int(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v?.toString() ?? '') ?? 0;
}

List<T> _list<T>(
  dynamic raw,
  T Function(Map<String, dynamic>) fromJson,
) {
  if (raw is! List) return [];
  return raw
      .whereType<Map>()
      .map((e) => fromJson(Map<String, dynamic>.from(e)))
      .toList();
}
