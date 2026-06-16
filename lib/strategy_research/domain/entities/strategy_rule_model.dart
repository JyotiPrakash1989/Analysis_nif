/// Rule-based strategy definition (entry, stop-loss, exit).
class StrategyRuleModel {
  const StrategyRuleModel({
    this.entryDescription = '',
    this.stopLossDescription = '',
    this.exitDescription = '',
  });

  final String entryDescription;
  final String stopLossDescription;
  final String exitDescription;
}
