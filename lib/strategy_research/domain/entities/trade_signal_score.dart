import 'backtest_config_model.dart';

/// Live 5-factor score (ChatGPT) plus PCR (Gemini) for CALL or PUT.
class TradeSignalScore {
  const TradeSignalScore({
    required this.callScore,
    required this.putScore,
    required this.maxScore,
    required this.callFactors,
    required this.putFactors,
    required this.config,
  });

  final int callScore;
  final int putScore;
  final int maxScore;
  final List<String> callFactors;
  final List<String> putFactors;
  final BacktestConfigModel config;

  bool get callMeetsThreshold => callScore >= config.minTradeScore;
  bool get putMeetsThreshold => putScore >= config.minTradeScore;

  String get callLabel => '$callScore/$maxScore';
  String get putLabel => '$putScore/$maxScore';

  String strengthLabel(int score) {
    if (score >= maxScore) return 'Strong';
    if (score >= config.minTradeScore) return 'Good';
    if (score >= config.minTradeScore - 1) return 'Weak';
    return 'Avoid';
  }
}

/// Inputs derived from candles, analytics, or live feed.
class MarketSignals {
  const MarketSignals({
    required this.price,
    this.emaFast,
    this.emaSlow,
    this.rsi,
    this.priorDayHigh,
    this.priorDayLow,
    this.volume,
    this.avgVolume20,
    this.pcr = 1.0,
    this.longBuildUp = false,
    this.shortBuildUp = false,
    this.vixRising = false,
    this.ivRankHigh = false,
  });

  final double price;
  final double? emaFast;
  final double? emaSlow;
  final double? rsi;
  final double? priorDayHigh;
  final double? priorDayLow;
  final double? volume;
  final double? avgVolume20;
  final double pcr;
  final bool longBuildUp;
  final bool shortBuildUp;
  final bool vixRising;
  final bool ivRankHigh;
}
