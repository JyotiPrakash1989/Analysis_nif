import '../../../strategy_research/data/dtos/mstock_historical_dto.dart';
import '../../domain/entities/niftyoptima_models.dart';
import 'local_market_helpers.dart';

StockSnapshot analyzeEquityCandles({
  required String symbol,
  required double ltp,
  required List<List<dynamic>> candles,
  required String source,
  String error = '',
}) {
  final bars = candlesToMinuteBars(candles);
  final closes = bars.map((b) => b.close).toList();
  final rsi = computeRsi(closes);
  final ema9 = closes.isEmpty ? null : emaSeries(closes, 9).last;
  final ema21 = closes.isEmpty ? null : emaSeries(closes, 21).last;

  final factors = <String>[];
  var score = 0.0;
  var suggest = false;

  if (ema9 != null && ema21 != null && ltp > ema9 && ema9 > ema21) {
    score += 30;
    factors.add('EMA9 > EMA21 bullish');
  }
  if (rsi != null && rsi >= 45 && rsi <= 68) {
    score += 25;
    factors.add('RSI in buy zone');
  }
  if (bars.length >= 16) {
    final prior = bars.sublist(bars.length - 16, bars.length - 1);
    final priorHigh = prior.map((b) => b.high).reduce((a, b) => a > b ? a : b);
    if (ltp > priorHigh) {
      score += 25;
      factors.add('Break above prior 15m high');
      suggest = true;
    }
  }

  final entry = ltp;
  final sl = entry * 0.985;
  final tgt = entry * 1.02;
  final confidence = score.clamp(0, 100).toDouble();

  return StockSnapshot(
    symbol: symbol,
    ltp: ltp,
    source: source,
    error: error,
    barsCount: bars.length,
    analysis: EquityAnalysis(
      side: suggest ? 'BUY' : null,
      suggestPurchase: suggest && score >= 50,
      entry: suggest ? entry : null,
      sl: suggest ? sl : null,
      tgt: suggest ? tgt : null,
      confidence: confidence,
      score: score,
      rationale: suggest
          ? 'On-device intraday setup (${factors.join(' · ')})'
          : factors.isEmpty
              ? 'No setup — need more bars or trend'
              : 'Watching: ${factors.join(' · ')}',
      factors: factors,
    ),
  );
}

RankedStock rankStock(StockSnapshot s) {
  final a = s.analysis;
  final rewardPct = a.entry != null && a.tgt != null && a.entry! > 0
      ? ((a.tgt! - a.entry!) / a.entry!) * 100
      : 0.0;
  return RankedStock(
    symbol: s.symbol,
    name: s.name,
    ltp: s.ltp,
    source: s.source,
    error: s.error,
    analysis: a,
    barsCount: s.barsCount,
    profitScore: a.score,
    rewardPct: rewardPct,
  );
}

bool historicalOk(MstockHistoricalResponseDto r) => r.isSuccess;
