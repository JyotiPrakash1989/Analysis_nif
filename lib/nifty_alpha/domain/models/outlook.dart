/// User's market outlook for Smart Strike suggestion.
enum Outlook {
  bullish,
  bearish,
  neutral,
  scalping,
}

extension OutlookX on Outlook {
  String get label {
    switch (this) {
      case Outlook.bullish:
        return 'Bullish';
      case Outlook.bearish:
        return 'Bearish';
      case Outlook.neutral:
        return 'Neutral';
      case Outlook.scalping:
        return 'Scalping';
    }
  }
}
