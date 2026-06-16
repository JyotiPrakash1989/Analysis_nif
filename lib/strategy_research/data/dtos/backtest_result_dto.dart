import '../../domain/entities/backtest_result_model.dart';

/// DTO for backtest result from API or local computation.
class BacktestResultDto {
  const BacktestResultDto({
    this.winRate = 0,
    this.totalTrades = 0,
    this.winningTrades = 0,
    this.maxDrawdownPercent = 0,
    this.riskRewardRatio = 0,
    this.netPnl = 0,
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
  final String? optionRecommendation;
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

  static OptionRecommendation? _parseRecommendation(String? v) {
    if (v == null) return null;
    switch (v.toUpperCase()) {
      case 'CALL':
        return OptionRecommendation.call;
      case 'PUT':
        return OptionRecommendation.put;
      default:
        return null;
    }
  }

  factory BacktestResultDto.fromJson(Map<String, dynamic> json) {
    return BacktestResultDto(
      winRate: (json['win_rate'] as num?)?.toDouble() ?? 0,
      totalTrades: json['total_trades'] as int? ?? 0,
      winningTrades: json['winning_trades'] as int? ?? 0,
      maxDrawdownPercent: (json['max_drawdown_percent'] as num?)?.toDouble() ?? 0,
      riskRewardRatio: (json['risk_reward_ratio'] as num?)?.toDouble() ?? 0,
      netPnl: (json['net_pnl'] as num?)?.toDouble() ?? 0,
      summary: json['summary'] as String? ?? '',
      optionRecommendation: json['option_recommendation'] as String?,
      recommendedStrikePrice: json['recommended_strike_price'] as int?,
      recommendedOptionPrice: (json['recommended_option_price'] as num?)?.toDouble(),
      optionEntryPrice: (json['option_entry_price'] as num?)?.toDouble(),
      optionExitPrice: (json['option_exit_price'] as num?)?.toDouble(),
      optionStopLoss: (json['option_stop_loss'] as num?)?.toDouble(),
      recommendedExpiryDate: _parseDate(json['recommended_expiry_date']),
      callSignalScore: json['call_signal_score'] as int?,
      putSignalScore: json['put_signal_score'] as int?,
      signalStrength: json['signal_strength'] as String?,
      strategyReason: json['strategy_reason'] as String?,
      variantName: json['variant_name'] as String?,
      profitabilityScore: (json['profitability_score'] as num?)?.toDouble(),
      rank: json['rank'] as int?,
    );
  }

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is String) return DateTime.tryParse(v);
    if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
    return null;
  }

  Map<String, dynamic> toJson() => {
        'win_rate': winRate,
        'total_trades': totalTrades,
        'winning_trades': winningTrades,
        'max_drawdown_percent': maxDrawdownPercent,
        'risk_reward_ratio': riskRewardRatio,
        'net_pnl': netPnl,
        'summary': summary,
        'option_recommendation': optionRecommendation,
        'recommended_strike_price': recommendedStrikePrice,
        'recommended_option_price': recommendedOptionPrice,
        'option_entry_price': optionEntryPrice,
        'option_exit_price': optionExitPrice,
        'option_stop_loss': optionStopLoss,
        'recommended_expiry_date': recommendedExpiryDate?.toIso8601String(),
        'call_signal_score': callSignalScore,
        'put_signal_score': putSignalScore,
        'signal_strength': signalStrength,
        'strategy_reason': strategyReason,
        'variant_name': variantName,
        'profitability_score': profitabilityScore,
        'rank': rank,
      };

  BacktestResultModel toDomain() => BacktestResultModel(
        winRate: winRate,
        totalTrades: totalTrades,
        winningTrades: winningTrades,
        maxDrawdownPercent: maxDrawdownPercent,
        riskRewardRatio: riskRewardRatio,
        netPnl: netPnl,
        summary: summary,
        optionRecommendation: _parseRecommendation(optionRecommendation),
        recommendedStrikePrice: recommendedStrikePrice,
        recommendedOptionPrice: recommendedOptionPrice,
        optionEntryPrice: optionEntryPrice,
        optionExitPrice: optionExitPrice,
        optionStopLoss: optionStopLoss,
        recommendedExpiryDate: recommendedExpiryDate,
        callSignalScore: callSignalScore,
        putSignalScore: putSignalScore,
        signalStrength: signalStrength,
        strategyReason: strategyReason,
        variantName: variantName,
        profitabilityScore: profitabilityScore,
        rank: rank,
      );

  factory BacktestResultDto.fromDomain(BacktestResultModel model) {
    return BacktestResultDto(
      winRate: model.winRate,
      totalTrades: model.totalTrades,
      winningTrades: model.winningTrades,
      maxDrawdownPercent: model.maxDrawdownPercent,
      riskRewardRatio: model.riskRewardRatio,
      netPnl: model.netPnl,
      summary: model.summary,
      optionRecommendation: model.optionRecommendation == OptionRecommendation.call
          ? 'CALL'
          : model.optionRecommendation == OptionRecommendation.put
              ? 'PUT'
              : null,
      recommendedStrikePrice: model.recommendedStrikePrice,
      recommendedOptionPrice: model.recommendedOptionPrice,
      optionEntryPrice: model.optionEntryPrice,
      optionExitPrice: model.optionExitPrice,
      optionStopLoss: model.optionStopLoss,
      recommendedExpiryDate: model.recommendedExpiryDate,
      callSignalScore: model.callSignalScore,
      putSignalScore: model.putSignalScore,
      signalStrength: model.signalStrength,
      strategyReason: model.strategyReason,
      variantName: model.variantName,
      profitabilityScore: model.profitabilityScore,
      rank: model.rank,
    );
  }
}
