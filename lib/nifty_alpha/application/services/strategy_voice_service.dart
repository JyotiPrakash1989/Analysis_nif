import 'package:flutter_tts/flutter_tts.dart';

import '../../../niftyoptima/domain/entities/niftyoptima_models.dart';
import '../../domain/strategy_voice_text.dart';

/// On-device TTS for strategy alerts (mirrors stat_react strategyVoice.ts).
class StrategyVoiceService {
  StrategyVoiceService() {
    _init();
  }

  final FlutterTts _tts = FlutterTts();
  final Set<String> _spokenKeys = {};
  bool _ready = false;

  Future<void> _init() async {
    await _tts.setLanguage('en-IN');
    await _tts.setSpeechRate(0.45);
    await _tts.setPitch(1.0);
    _ready = true;
  }

  bool get isSupported => true;

  Future<void> speak(String text) async {
    if (text.isEmpty) return;
    if (!_ready) await _init();
    await _tts.stop();
    await _tts.speak(text);
  }

  Future<void> speakOnce(String key, String text) async {
    if (_spokenKeys.contains(key)) return;
    _spokenKeys.add(key);
    await speak(text);
  }

  Future<void> speakSignal(SignalPayload sig, bool autoTrading) async {
    await speakOnce(signalAlertKey(sig), signalVoiceText(sig, autoTrading));
  }

  Future<void> speakHold(HoldSuggestion hold) async {
    await speakOnce(holdSuggestionAlertKey(hold), holdForTargetVoiceText(hold));
  }

  Future<void> speakTradingMode(bool autoTrading) async {
    await speak(tradingModeVoiceText(autoTrading));
  }

  Future<void> speakOrderLog(OrderLogEntry entry) async {
    final text = orderLogVoiceText(entry);
    if (text.isEmpty) return;
    final key = '${entry.action}-${entry.trigger}-'
        '${entry.orderId ?? entry.id}-${entry.ts}';
    await speakOnce(key, text);
  }

  Future<void> speakPositionExit({
    required int strike,
    required String optionType,
    required String kind,
    required double ltp,
    required double level,
    required String orderId,
  }) async {
    final key = 'exit-alert-$orderId-$kind';
    await speakOnce(
      key,
      positionExitVoiceText(strike, optionType, kind, ltp, level),
    );
  }

  Future<void> speakProfitableSide({
    required double ceScore,
    required double peScore,
  }) async {
    final bucket = DateTime.now().millisecondsSinceEpoch ~/ (15 * 60 * 1000);
    final key = 'profit-side-$bucket-${ceScore.round()}-${peScore.round()}';
    await speakOnce(
      key,
      profitableSideVoiceText(ceScore: ceScore, peScore: peScore),
    );
  }

  Future<void> speakTest({bool? autoTrading}) async {
    await speak(voiceTestText(autoTrading: autoTrading));
  }

  void clearSessionKeys() => _spokenKeys.clear();
}
