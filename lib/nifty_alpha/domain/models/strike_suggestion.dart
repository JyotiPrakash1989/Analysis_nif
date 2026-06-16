import 'outlook.dart';

/// Suggested strike from Smart Strike Selector.
class StrikeSuggestion {
  const StrikeSuggestion({
    required this.outlook,
    required this.suggestedStrike,
    required this.reason,
    required this.deltaHint,
    this.optionType,
    this.entryPrice,
    this.stopLoss,
    this.target,
    this.risk,
    this.expiryDate,
  });

  final Outlook outlook;
  final int suggestedStrike;
  final String reason;
  final String deltaHint;
  final String? optionType; // CE / PE
  final double? entryPrice;
  final double? stopLoss;
  final double? target;
  final double? risk;
  final DateTime? expiryDate;

  bool get hasTradeLevels =>
      entryPrice != null && stopLoss != null && target != null;

  String get displayStrike => optionType != null
      ? '$suggestedStrike $optionType'
      : suggestedStrike.toString();
}
