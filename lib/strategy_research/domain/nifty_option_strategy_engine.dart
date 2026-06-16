import 'entities/backtest_config_model.dart';
import 'entities/backtest_result_model.dart';
import 'entities/trade_signal_score.dart';
import 'option_recommendation_engine.dart';

/// Merged strategy: ChatGPT 5-factor score + Gemini PCR/volatility + backtest edge.
class NiftyOptionStrategyEngine {
  NiftyOptionStrategyEngine._();

  static const int scoreFactors = 5;

  /// Scores CALL and PUT from [signals] using trend, RSI, OI, breakout, volume.
  static TradeSignalScore scoreSignals(
    MarketSignals signals,
    BacktestConfigModel config,
  ) {
    final callFactors = <String>[];
    final putFactors = <String>[];
    var call = 0;
    var put = 0;

    final emaF = signals.emaFast;
    final emaS = signals.emaSlow;
    final rsi = signals.rsi;
    final price = signals.price;

    if (emaF != null && emaS != null) {
      if (price > emaF && emaF > emaS) {
        call++;
        callFactors.add('Trend bullish (20>50 EMA)');
      }
      if (price < emaF && emaF < emaS) {
        put++;
        putFactors.add('Trend bearish (20<50 EMA)');
      }
    }

    if (rsi != null) {
      if (rsi >= config.rsiBullishMin) {
        call++;
        callFactors.add('RSI ≥ ${config.rsiBullishMin}');
      }
      if (rsi <= config.rsiBearishMax) {
        put++;
        putFactors.add('RSI ≤ ${config.rsiBearishMax}');
      }
    }

    if (signals.longBuildUp) {
      call++;
      callFactors.add('Long build-up (price↑ OI↑)');
    }
    if (signals.shortBuildUp) {
      put++;
      putFactors.add('Short build-up (price↓ OI↑)');
    }

    final pdh = signals.priorDayHigh;
    final pdl = signals.priorDayLow;
    if (pdh != null && price > pdh) {
      call++;
      callFactors.add('Breakout above prior day high');
    }
    if (pdl != null && price < pdl) {
      put++;
      putFactors.add('Breakdown below prior day low');
    }

    final vol = signals.volume;
    final avgVol = signals.avgVolume20;
    if (vol != null && avgVol != null && avgVol > 0 && vol > avgVol) {
      if (emaF != null && emaS != null && price > emaF && emaF > emaS) {
        call++;
        callFactors.add('Volume above 20-bar avg');
      }
      if (emaF != null && emaS != null && price < emaF && emaF < emaS) {
        put++;
        putFactors.add('Volume above 20-bar avg');
      }
    }

    return TradeSignalScore(
      callScore: call.clamp(0, scoreFactors),
      putScore: put.clamp(0, scoreFactors),
      maxScore: scoreFactors,
      callFactors: callFactors,
      putFactors: putFactors,
      config: config,
    );
  }

  /// Builds [MarketSignals] from the last candle window and optional live analytics.
  static MarketSignals signalsFromCandles({
    required List<double> closes,
    required List<double> highs,
    required List<double> lows,
    required List<double> volumes,
    required BacktestConfigModel config,
    double pcr = 1.0,
    bool longBuildUp = false,
    bool shortBuildUp = false,
    bool vixRising = false,
    bool ivRankHigh = false,
  }) {
    if (closes.isEmpty) {
      return MarketSignals(
        price: 0,
        pcr: pcr,
        longBuildUp: longBuildUp,
        shortBuildUp: shortBuildUp,
        vixRising: vixRising,
        ivRankHigh: ivRankHigh,
      );
    }

    final emaFast = _ema(closes, config.emaFastPeriod);
    final emaSlow = _ema(closes, config.emaSlowPeriod);
    final rsi = _rsi(closes, config.rsiPeriod);
    final i = closes.length - 1;

    final priorDayHigh = _priorSessionHigh(highs);
    final priorDayLow = _priorSessionLow(lows);
    final avgVol = volumes.length >= 20
        ? volumes.sublist(volumes.length - 20).reduce((a, b) => a + b) / 20
        : null;

    return MarketSignals(
      price: closes[i],
      emaFast: emaFast[i],
      emaSlow: emaSlow[i],
      rsi: rsi[i],
      priorDayHigh: priorDayHigh,
      priorDayLow: priorDayLow,
      volume: volumes.isNotEmpty ? volumes[i] : null,
      avgVolume20: avgVol,
      pcr: pcr,
      longBuildUp: longBuildUp,
      shortBuildUp: shortBuildUp,
      vixRising: vixRising,
      ivRankHigh: ivRankHigh,
    );
  }

  /// Picks CALL or PUT using live score + backtest metrics; blocks high IV longs.
  static OptionRecommendation recommend({
    required TradeSignalScore liveScore,
    required MarketSignals signals,
    required OptionStrategyMetrics callMetrics,
    required OptionStrategyMetrics putMetrics,
    required BacktestConfigModel config,
  }) {
    if (signals.ivRankHigh) {
      return OptionRecommendationEngine.suggestMoreProfitable(
        callMetrics: callMetrics,
        putMetrics: putMetrics,
        config: config,
      );
    }

    final callOk = OptionRecommendationEngine.isTradeable(
      callMetrics,
      config: config,
    );
    final putOk = OptionRecommendationEngine.isTradeable(
      putMetrics,
      config: config,
    );
    var callScoreOk = liveScore.callMeetsThreshold;
    var putScoreOk = liveScore.putMeetsThreshold;

    if (signals.pcr < config.pcrBearishMax) callScoreOk = false;
    if (signals.pcr <= config.pcrBearishMax) putScoreOk = putScoreOk || liveScore.putScore >= config.minTradeScore;
    if (signals.vixRising) {
      callScoreOk = false;
      if (liveScore.putScore >= config.minTradeScore - 1) putScoreOk = true;
    }

    final callComposite = compositeScore(
      scoreOk: callScoreOk,
      signalScore: liveScore.callScore,
      metrics: callMetrics,
    );
    final putComposite = compositeScore(
      scoreOk: putScoreOk,
      signalScore: liveScore.putScore,
      metrics: putMetrics,
    );

    if (callScoreOk && callOk && (!putScoreOk || !putOk)) {
      return OptionRecommendation.call;
    }
    if (putScoreOk && putOk && (!callScoreOk || !callOk)) {
      return OptionRecommendation.put;
    }
    if (callScoreOk && callOk && putScoreOk && putOk) {
      return callComposite >= putComposite
          ? OptionRecommendation.call
          : OptionRecommendation.put;
    }
    if (callOk && putOk) {
      return OptionRecommendationEngine.suggestMoreProfitable(
        callMetrics: callMetrics,
        putMetrics: putMetrics,
        config: config,
      );
    }
    if (callScoreOk && !putScoreOk) return OptionRecommendation.call;
    if (putScoreOk && !callScoreOk) return OptionRecommendation.put;
    if (callOk) return OptionRecommendation.call;
    if (putOk) return OptionRecommendation.put;
    return callComposite >= putComposite
        ? OptionRecommendation.call
        : OptionRecommendation.put;
  }

  static double compositeScore({
    required bool scoreOk,
    required int signalScore,
    required OptionStrategyMetrics metrics,
  }) {
    return (scoreOk ? signalScore * 12.0 : signalScore * 4.0) + metrics.profitabilityScore;
  }

  static int strikeForOptionType({
    required double spot,
    required OptionRecommendation recommendation,
    bool weeklyBuy = true,
  }) {
    final atm = _roundToStrike(spot.round());
    if (recommendation == OptionRecommendation.call) {
      return weeklyBuy ? atm - 50 : atm;
    }
    return weeklyBuy ? atm + 50 : atm;
  }

  static int _roundToStrike(int spot) {
    final remainder = spot % 50;
    if (remainder == 0) return spot;
    return remainder >= 25 ? spot + (50 - remainder) : spot - remainder;
  }

  static String buildReason({
    required OptionRecommendation recommendation,
    required TradeSignalScore liveScore,
    required OptionStrategyMetrics metrics,
    required BacktestConfigModel config,
  }) {
    final isCall = recommendation == OptionRecommendation.call;
    final score = isCall ? liveScore.callLabel : liveScore.putLabel;
    final strength =
        liveScore.strengthLabel(isCall ? liveScore.callScore : liveScore.putScore);
    return '${isCall ? 'CALL' : 'PUT'} $score ($strength) • '
        'Backtest WR ${metrics.winRate.toStringAsFixed(0)}% • '
        '1:${config.minRiskRewardRatio.toStringAsFixed(0)} R:R '
        '(${config.stopLossPercent.toStringAsFixed(0)}% SL / '
        '${config.targetRewardPercent.toStringAsFixed(0)}% target)';
  }

  static List<double> _ema(List<double> closes, int period) {
    final out = List<double>.filled(closes.length, 0);
    double sum = 0;
    for (var i = 0; i < closes.length; i++) {
      if (i < period) {
        sum += closes[i];
        out[i] = sum / (i + 1);
      } else {
        final k = 2 / (period + 1);
        out[i] = closes[i] * k + out[i - 1] * (1 - k);
      }
    }
    return out;
  }

  static List<double?> _rsi(List<double> closes, int period) {
    final out = List<double?>.filled(closes.length, null);
    for (var i = period; i < closes.length; i++) {
      double gain = 0, loss = 0;
      for (var j = i - period + 1; j <= i; j++) {
        final ch = closes[j] - closes[j - 1];
        if (ch > 0) {
          gain += ch;
        } else {
          loss -= ch;
        }
      }
      final avgGain = gain / period;
      final avgLoss = loss / period;
      if (avgLoss == 0) {
        out[i] = 100;
      } else {
        final rs = avgGain / avgLoss;
        out[i] = 100 - (100 / (1 + rs));
      }
    }
    return out;
  }

  static double? _priorSessionHigh(List<double> highs) {
    if (highs.length < 10) return null;
    final split = (highs.length * 0.7).floor();
    if (split <= 0) return null;
    return highs.sublist(0, split).reduce((a, b) => a > b ? a : b);
  }

  static double? _priorSessionLow(List<double> lows) {
    if (lows.length < 10) return null;
    final split = (lows.length * 0.7).floor();
    if (split <= 0) return null;
    return lows.sublist(0, split).reduce((a, b) => a < b ? a : b);
  }
}
