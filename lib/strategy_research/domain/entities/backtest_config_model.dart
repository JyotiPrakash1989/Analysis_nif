/// Configuration for NIFTY option strategy (ChatGPT + Gemini + backtest).
class BacktestConfigModel {
  const BacktestConfigModel({
    this.symbol = 'NIFTY',
    this.emaFastPeriod = 20,
    this.emaSlowPeriod = 50,
    this.rsiPeriod = 14,
    this.rsiBullishMin = 60,
    this.rsiBearishMax = 40,
    this.stopLossPercent = 15.0,
    this.targetRewardPercent = 30.0,
    this.minRiskRewardRatio = 2.0,
    this.minWinRate = 52.0,
    this.minBacktestTrades = 8,
    this.minTradeScore = 4,
    this.pcrBullishMin = 1.0,
    this.pcrBearishMax = 0.7,
    this.trailingSlProfitPercent = 10.0,
    this.deltaMin = 0.40,
    this.deltaMax = 0.60,
    this.startDate,
    this.endDate,
  });

  /// Named presets evaluated together; more profitable variants are all suggested.
  static const conservative = BacktestConfigModel(
    stopLossPercent: 10.0,
    targetRewardPercent: 20.0,
    rsiBullishMin: 65,
    rsiBearishMax: 35,
    minTradeScore: 4,
  );

  static const aggressive = BacktestConfigModel(
    stopLossPercent: 20.0,
    targetRewardPercent: 40.0,
    rsiBullishMin: 55,
    rsiBearishMax: 45,
    minTradeScore: 3,
    minBacktestTrades: 6,
  );

  static const momentum = BacktestConfigModel(
    rsiBullishMin: 62,
    rsiBearishMax: 38,
    stopLossPercent: 12.0,
    targetRewardPercent: 24.0,
  );

  static const scalpingStyle = BacktestConfigModel(
    stopLossPercent: 8.0,
    targetRewardPercent: 16.0,
    rsiBullishMin: 58,
    rsiBearishMax: 42,
    minTradeScore: 3,
    minBacktestTrades: 6,
    minWinRate: 50.0,
  );

  /// Merged ChatGPT momentum + Gemini risk defaults for weekly option buying.
  static const optimal = BacktestConfigModel(
    emaFastPeriod: 20,
    emaSlowPeriod: 50,
    rsiPeriod: 14,
    rsiBullishMin: 60,
    rsiBearishMax: 40,
    stopLossPercent: 15.0,
    targetRewardPercent: 30.0,
    minRiskRewardRatio: 2.0,
    minWinRate: 52.0,
    minBacktestTrades: 8,
    minTradeScore: 4,
    pcrBullishMin: 1.0,
    pcrBearishMax: 0.7,
    trailingSlProfitPercent: 10.0,
    deltaMin: 0.40,
    deltaMax: 0.60,
  );

  final String symbol;
  final int emaFastPeriod;
  final int emaSlowPeriod;
  final int rsiPeriod;
  final int rsiBullishMin;
  final int rsiBearishMax;
  final double stopLossPercent;
  final double targetRewardPercent;
  final double minRiskRewardRatio;
  final double minWinRate;
  final int minBacktestTrades;
  final int minTradeScore;
  final double pcrBullishMin;
  final double pcrBearishMax;
  final double trailingSlProfitPercent;
  final double deltaMin;
  final double deltaMax;
  final DateTime? startDate;
  final DateTime? endDate;

  /// Legacy alias used by older call sites.
  int get emaPeriod => emaFastPeriod;
  int get rsiOversold => rsiBearishMax;
  int get rsiOverbought => rsiBullishMin;

  BacktestConfigModel copyWith({
    String? symbol,
    int? emaFastPeriod,
    int? emaSlowPeriod,
    int? rsiPeriod,
    int? rsiBullishMin,
    int? rsiBearishMax,
    double? stopLossPercent,
    double? targetRewardPercent,
    double? minRiskRewardRatio,
    double? minWinRate,
    int? minBacktestTrades,
    int? minTradeScore,
    double? pcrBullishMin,
    double? pcrBearishMax,
    double? trailingSlProfitPercent,
    double? deltaMin,
    double? deltaMax,
    DateTime? startDate,
    DateTime? endDate,
  }) {
    return BacktestConfigModel(
      symbol: symbol ?? this.symbol,
      emaFastPeriod: emaFastPeriod ?? this.emaFastPeriod,
      emaSlowPeriod: emaSlowPeriod ?? this.emaSlowPeriod,
      rsiPeriod: rsiPeriod ?? this.rsiPeriod,
      rsiBullishMin: rsiBullishMin ?? this.rsiBullishMin,
      rsiBearishMax: rsiBearishMax ?? this.rsiBearishMax,
      stopLossPercent: stopLossPercent ?? this.stopLossPercent,
      targetRewardPercent: targetRewardPercent ?? this.targetRewardPercent,
      minRiskRewardRatio: minRiskRewardRatio ?? this.minRiskRewardRatio,
      minWinRate: minWinRate ?? this.minWinRate,
      minBacktestTrades: minBacktestTrades ?? this.minBacktestTrades,
      minTradeScore: minTradeScore ?? this.minTradeScore,
      pcrBullishMin: pcrBullishMin ?? this.pcrBullishMin,
      pcrBearishMax: pcrBearishMax ?? this.pcrBearishMax,
      trailingSlProfitPercent:
          trailingSlProfitPercent ?? this.trailingSlProfitPercent,
      deltaMin: deltaMin ?? this.deltaMin,
      deltaMax: deltaMax ?? this.deltaMax,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
    );
  }
}
