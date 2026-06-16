import '../../../strategy_research/domain/entities/backtest_config_model.dart';
import '../../../strategy_research/domain/entities/backtest_result_model.dart';
import '../../domain/entities/niftyoptima_models.dart';
import 'local_order_store.dart';

int atmStrikeFromSpot(double spot) => (spot / 50).round() * 50;

const optionChainStrikeCount = 11;

double _round2(double v) => (v * 100).roundToDouble() / 100;

/// Simulated premium for weekly expiry (mirrors stat_react estimateOptionPremium).
double estimateOptionPremium(
  double spot,
  int strike,
  bool isCall,
  int daysToExp,
) {
  final intrinsic =
      isCall ? (spot - strike).clamp(0.0, double.infinity) : (strike - spot).clamp(0.0, double.infinity);
  final otmDist =
      isCall ? (strike - spot).clamp(0.0, double.infinity) : (spot - strike).clamp(0.0, double.infinity);
  final timeValue = (42 - otmDist * 0.38 - daysToExp * 2.4);
  return _round2(intrinsic + (timeValue < 3.5 ? 3.5 : timeValue));
}

/// ATM-centered strikes so signal ATM row is always in chain.
List<int> strikesAroundAtm(double spot, {int step = 50, int count = optionChainStrikeCount}) {
  final atm = atmStrikeFromSpot(spot);
  final offset = count ~/ 2;
  return List.generate(count, (i) => atm + (i - offset) * step);
}

/// CE/PE LTP from chain row, or model premium when row is missing.
double optionLegLtp({
  required double spot,
  required int strike,
  required String optionType,
  List<OptionChainRow> chain = const [],
  DateTime? now,
}) {
  if (chain.isNotEmpty) {
    for (final row in chain) {
      if (row.strike == strike) {
        final ltp = optionType == 'CE' ? row.ce.ltp : row.pe.ltp;
        if (ltp.isFinite && ltp > 0) return ltp;
      }
    }
  }
  final expiry = nearestNiftyWeeklyExpiry(now);
  final days = daysUntilNiftyExpiry(expiry, now);
  return estimateOptionPremium(spot, strike, optionType == 'CE', days);
}

const _monthLabels = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const _weekdayLabels = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/// IST calendar parts (weekday: Sun=0 … Sat=6 — matches stat_react analysis.mjs).
({int year, int month, int day, int hour, int minute, int dayOfWeek}) istCalendar([
  DateTime? now,
]) {
  final ist = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 5, minutes: 30));
  return (
    year: ist.year,
    month: ist.month,
    day: ist.day,
    hour: ist.hour,
    minute: ist.minute,
    dayOfWeek: ist.weekday % 7,
  );
}

/// Nearest NIFTY weekly expiry (NSE Tuesday, 3:30 PM IST).
DateTime nearestNiftyWeeklyExpiry([DateTime? now]) {
  final ist = istCalendar(now);
  final afterExpiry = ist.hour > 15 || (ist.hour == 15 && ist.minute >= 30);
  const tuesday = 2;
  var daysUntil = (tuesday - ist.dayOfWeek + 7) % 7;
  if (daysUntil == 0 && afterExpiry) daysUntil = 7;
  return DateTime(ist.year, ist.month, ist.day + daysUntil);
}

String formatNiftyExpiryLabel(DateTime date) {
  return '${date.day.toString().padLeft(2, '0')} '
      '${_monthLabels[date.month - 1]} ${date.year}';
}

String formatNiftyExpiryWithDay(DateTime date) {
  final dayName = _weekdayLabels[date.weekday % 7];
  return '$dayName · ${formatNiftyExpiryLabel(date)}';
}

int daysUntilNiftyExpiry(DateTime expiry, [DateTime? now]) {
  final ist = istCalendar(now);
  final today = DateTime(ist.year, ist.month, ist.day);
  final exp = DateTime(expiry.year, expiry.month, expiry.day);
  final diff = exp.difference(today).inDays;
  return diff < 0 ? 0 : diff;
}

String niftyExpiryDaysHint(DateTime expiry, [DateTime? now]) {
  final days = daysUntilNiftyExpiry(expiry, now);
  if (days == 0) return 'expires today';
  if (days == 1) return '1 day left';
  return '$days days left';
}

String _dayKeyFromBarTime(int timeMs) {
  final ist = DateTime.fromMillisecondsSinceEpoch(timeMs, isUtc: true)
      .add(const Duration(hours: 5, minutes: 30));
  return '${ist.year.toString().padLeft(4, '0')}-'
      '${ist.month.toString().padLeft(2, '0')}-'
      '${ist.day.toString().padLeft(2, '0')}';
}

/// Intraday move vs previous session close (mirrors stat_react computeNiftyDayChange).
NiftyDayChange? computeNiftyDayChange(
  double spot,
  List<MinuteBar> minuteBars, {
  double? explicitPrevClose,
}) {
  if (!spot.isFinite) return null;

  double? prevClose = explicitPrevClose;
  double? dayOpen;
  var basis = 'prevClose';

  if (minuteBars.isNotEmpty) {
    final sorted = [...minuteBars]..sort((a, b) => a.time.compareTo(b.time));
    final todayKey = LocalOrderStore.istDayKey();
    final byDay = <String, List<MinuteBar>>{};
    for (final b in sorted) {
      (byDay[_dayKeyFromBarTime(b.time)] ??= []).add(b);
    }
    final todayBars = byDay[todayKey] ?? [];
    if (todayBars.isNotEmpty) dayOpen = todayBars.first.open;

    if (prevClose == null) {
      final keys = byDay.keys.toList()..sort();
      final todayIdx = keys.indexOf(todayKey);
      if (todayIdx > 0) {
        final prior = byDay[keys[todayIdx - 1]];
        if (prior != null && prior.isNotEmpty) {
          prevClose = prior.last.close;
        }
      } else if (todayBars.isNotEmpty) {
        prevClose = todayBars.first.open;
        basis = 'open';
      }
    }
  }

  if (prevClose == null || !prevClose.isFinite || prevClose == 0) return null;
  final points = spot - prevClose;
  final percent = (points / prevClose) * 100;
  return NiftyDayChange(
    prevClose: prevClose,
    dayOpen: dayOpen,
    points: (points * 100).roundToDouble() / 100,
    percent: (percent * 100).roundToDouble() / 100,
    basis: basis,
  );
}

List<MinuteBar> candlesToMinuteBars(List<List<dynamic>> candles) {
  final bars = <MinuteBar>[];
  for (final c in candles) {
    if (c.length < 5) continue;
    final ts = c[0];
    final time = ts is int
        ? ts
        : ts is num
            ? ts.toInt()
            : DateTime.tryParse(ts.toString())?.millisecondsSinceEpoch ?? 0;
    bars.add(MinuteBar(
      time: time,
      open: _n(c[1]),
      high: _n(c[2]),
      low: _n(c[3]),
      close: _n(c[4]),
    ));
  }
  bars.sort((a, b) => a.time.compareTo(b.time));
  return bars;
}

double _n(dynamic v) {
  if (v is num) return v.toDouble();
  return double.tryParse(v?.toString() ?? '') ?? 0;
}

/// Simulated option chain around ATM (mirrors stat_react buildOptionChainSnapshot).
List<OptionChainRow> buildSimulatedOptionChain(double spot, [DateTime? now]) {
  if (!spot.isFinite) return [];
  final expiry = nearestNiftyWeeklyExpiry(now);
  final days = daysUntilNiftyExpiry(expiry, now);
  final strikes = strikesAroundAtm(spot);
  return strikes.map((strike) {
    final dist = ((strike - atmStrikeFromSpot(spot)) / 50).round();
    return OptionChainRow(
      strike: strike,
      ce: OptionLeg(
        ltp: estimateOptionPremium(spot, strike, true, days),
        oiChangePct: (30 + dist * 12).toDouble(),
        volume: 1000 + dist.abs() * 200,
      ),
      pe: OptionLeg(
        ltp: estimateOptionPremium(spot, strike, false, days),
        oiChangePct: (25 - dist * 10).toDouble(),
        volume: 900 + dist.abs() * 180,
      ),
    );
  }).toList(growable: false);
}

SignalPayload? signalFromBacktest(BacktestResultModel? b, {int? signalIndex}) {
  if (b == null) return null;
  final side = b.optionRecommendation == OptionRecommendation.call ? 'CE' : 'PE';
  final entry = b.optionEntryPrice ?? 85.0;
  final sl = b.optionStopLoss ??
      entry * (1 - BacktestConfigModel.optimal.stopLossPercent / 100);
  final tgt = b.optionExitPrice ??
      entry * (1 + BacktestConfigModel.optimal.targetRewardPercent / 100);
  final strike = b.recommendedStrikePrice ?? 24500;
  return SignalPayload(
    side: side,
    strike: strike,
    optionType: side,
    entry: entry,
    sl: sl,
    tgt: tgt,
    risk: entry - sl,
    rationale: b.strategyReason ?? 'On-device signal • ${b.signalStrength ?? 'Good'}',
    ts: DateTime.now().millisecondsSinceEpoch,
    dailyPick: true,
    confidence: b.profitabilityScore,
    signalIndex: signalIndex,
  );
}

double? computeRsi(List<double> closes, {int period = 14}) {
  if (closes.length < period + 1) return null;
  var gains = 0.0;
  var losses = 0.0;
  for (var i = closes.length - period; i < closes.length; i++) {
    final diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }
  if (losses == 0) return 100;
  final rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

List<double> emaSeries(List<double> values, int period) {
  if (values.isEmpty) return [];
  final k = 2 / (period + 1);
  final out = <double>[values.first];
  for (var i = 1; i < values.length; i++) {
    out.add(values[i] * k + out.last * (1 - k));
  }
  return out;
}
