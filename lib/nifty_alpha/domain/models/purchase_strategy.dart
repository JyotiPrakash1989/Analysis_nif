/// Strategy for purchasing Nifty option: entry, stop loss, book profit.
class PurchaseStrategy {
  const PurchaseStrategy({
    required this.entryPrice,
    required this.stopLoss,
    required this.bookProfit,
    required this.strikePrice,
    required this.optionType,
    this.niftyLevelAtEntry,
    this.expiryDate,
    this.reason,
    this.callSignalScore,
    this.putSignalScore,
    this.signalStrength,
    this.variantName,
    this.profitabilityScore,
    this.rank,
    this.signalIndex,
  });

  final double entryPrice;
  final double stopLoss;
  final double bookProfit;
  final int strikePrice;
  final String optionType;
  final double? niftyLevelAtEntry;
  final DateTime? expiryDate;
  final String? reason;
  final int? callSignalScore;
  final int? putSignalScore;
  final String? signalStrength;
  final String? variantName;
  final double? profitabilityScore;
  final int? rank;
  final int? signalIndex;

  String get strikeLabel => '$strikePrice $optionType';

  String get variantLabel {
    final name = variantName ?? 'Strategy';
    if (rank != null) return '#$rank $name';
    return name;
  }

  String get scoreLabel {
    if (optionType == 'CE' && callSignalScore != null) {
      return '$callSignalScore/5';
    }
    if (optionType == 'PE' && putSignalScore != null) {
      return '$putSignalScore/5';
    }
    return '';
  }
}
