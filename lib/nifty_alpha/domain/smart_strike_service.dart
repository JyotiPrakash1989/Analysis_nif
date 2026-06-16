import 'models/outlook.dart';
import 'models/strike_suggestion.dart';

/// Strike selection: weekly delta band (ChatGPT) + intraday ATM (Gemini).
class SmartStrikeService {
  StrikeSuggestion suggest({
    required int niftySpot,
    required Outlook outlook,
    bool weeklyBuy = false,
  }) {
    final atm = _roundToStrike(niftySpot);
    switch (outlook) {
      case Outlook.bullish:
        return StrikeSuggestion(
          outlook: outlook,
          suggestedStrike: weeklyBuy ? _oneItmCall(niftySpot) : atm,
          reason: weeklyBuy
              ? 'Weekly buy: 1 ITM CE, delta ~0.45–0.55 (momentum setup).'
              : 'Intraday ATM CE — same strike as live breakout signal.',
          deltaHint: weeklyBuy ? 'Delta ~0.50' : 'ATM · Delta ~0.5',
          optionType: 'CE',
        );
      case Outlook.bearish:
        return StrikeSuggestion(
          outlook: outlook,
          suggestedStrike: weeklyBuy ? _oneItmPut(niftySpot) : atm,
          reason: weeklyBuy
              ? 'Weekly buy: 1 ITM PE, delta ~0.45–0.55.'
              : 'Intraday ATM PE — same strike as live breakout signal.',
          deltaHint: weeklyBuy ? 'Delta ~0.50' : 'ATM · Delta ~0.5',
          optionType: 'PE',
        );
      case Outlook.scalping:
        return StrikeSuggestion(
          outlook: outlook,
          suggestedStrike: atm,
          reason: 'ATM for quick moves; best bid-ask (Gemini intraday).',
          deltaHint: 'Delta ~0.5',
          optionType: null,
        );
      case Outlook.neutral:
        return StrikeSuggestion(
          outlook: outlook,
          suggestedStrike: atm,
          reason: 'High IV: prefer OTM credit spreads; avoid long options (Gemini).',
          deltaHint: 'Sell OTM spread',
          optionType: null,
        );
    }
  }

  /// Strike for a resolved option type from merged strategy engine.
  int strikeForOptionType({
    required int niftySpot,
    required String optionType,
    bool weeklyBuy = true,
  }) {
    if (optionType == 'CE') {
      return weeklyBuy ? _oneItmCall(niftySpot) : _roundToStrike(niftySpot);
    }
    return weeklyBuy ? _oneItmPut(niftySpot) : _roundToStrike(niftySpot);
  }

  static int _oneItmCall(int spot) => _roundToStrike(spot) - 50;
  static int _oneItmPut(int spot) => _roundToStrike(spot) + 50;

  static int _roundToStrike(int spot) {
    final remainder = spot % 50;
    if (remainder == 0) return spot;
    return remainder >= 25 ? spot + (50 - remainder) : spot - remainder;
  }
}
