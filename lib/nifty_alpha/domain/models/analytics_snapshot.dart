/// Live analytics for dashboard: PCR, Max Pain, OI highlights.
class AnalyticsSnapshot {
  const AnalyticsSnapshot({
    required this.pcr,
    required this.pcrZone,
    required this.maxPainStrike,
    required this.oiHighlights,
  });

  final double pcr;
  final PcrZone pcrZone;
  final int maxPainStrike;
  final List<OiHighlight> oiHighlights;
}

enum PcrZone { overbought, oversold, neutral }

extension PcrZoneX on PcrZone {
  String get label {
    switch (this) {
      case PcrZone.overbought:
        return 'Overbought';
      case PcrZone.oversold:
        return 'Oversold';
      case PcrZone.neutral:
        return 'Neutral';
    }
  }
}

class OiHighlight {
  const OiHighlight({
    required this.strike,
    required this.optionType,
    required this.oiChangePercent,
    required this.label,
  });

  final int strike;
  final String optionType; // CE / PE
  final double oiChangePercent;
  final String label;
}
