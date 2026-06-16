/// Option type recommended for purchase after backtest analysis.
enum OptionRecommendation { call, put }

/// Result of a backtest run with performance metrics.
class BacktestResultModel {
  const BacktestResultModel({
    required this.winRate,
    required this.totalTrades,
    required this.winningTrades,
    required this.maxDrawdownPercent,
    required this.riskRewardRatio,
    required this.netPnl,
    this.summary = '',
    this.optionRecommendation,
    this.recommendedStrikePrice,
    this.recommendedOptionPrice,
    this.optionEntryPrice,
    this.optionExitPrice,
    this.optionStopLoss,
    this.recommendedExpiryDate,
    this.callSignalScore,
    this.putSignalScore,
    this.signalStrength,
    this.strategyReason,
    this.variantName,
    this.profitabilityScore,
    this.rank,
  });

  final double winRate;
  final int totalTrades;
  final int winningTrades;
  final double maxDrawdownPercent;
  final double riskRewardRatio;
  final double netPnl;
  final String summary;
  final OptionRecommendation? optionRecommendation;
  final int? recommendedStrikePrice;
  final double? recommendedOptionPrice;
  final double? optionEntryPrice;
  final double? optionExitPrice;
  final double? optionStopLoss;
  final DateTime? recommendedExpiryDate;
  final int? callSignalScore;
  final int? putSignalScore;
  final String? signalStrength;
  final String? strategyReason;
  final String? variantName;
  final double? profitabilityScore;
  final int? rank;

  static BacktestResultModel get empty => BacktestResultModel(
        winRate: 0,
        totalTrades: 0,
        winningTrades: 0,
        maxDrawdownPercent: 0,
        riskRewardRatio: 0,
        netPnl: 0,
      );
}
