import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../niftyoptima/application/providers/niftyoptima_providers.dart';
import '../services/strategy_voice_service.dart';

const _voiceKey = 'niftyoptima-voice-alerts';
const _autoKey = 'niftyoptima-auto-trading';

class TradingSettings {
  const TradingSettings({
    this.voiceEnabled = true,
    this.autoTrading = false,
    this.loaded = false,
    this.syncing = false,
  });

  final bool voiceEnabled;
  final bool autoTrading;
  final bool loaded;
  final bool syncing;

  TradingSettings copyWith({
    bool? voiceEnabled,
    bool? autoTrading,
    bool? loaded,
    bool? syncing,
  }) {
    return TradingSettings(
      voiceEnabled: voiceEnabled ?? this.voiceEnabled,
      autoTrading: autoTrading ?? this.autoTrading,
      loaded: loaded ?? this.loaded,
      syncing: syncing ?? this.syncing,
    );
  }
}

final strategyVoiceServiceProvider = Provider<StrategyVoiceService>((ref) {
  final service = StrategyVoiceService();
  ref.onDispose(service.clearSessionKeys);
  return service;
});

class TradingSettingsNotifier extends StateNotifier<TradingSettings> {
  TradingSettingsNotifier(this._ref) : super(const TradingSettings()) {
    _load();
  }

  final Ref _ref;

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final voice = prefs.getString(_voiceKey);
    final auto = prefs.getString(_autoKey);
    final voiceOn = voice != '0' && voice != 'false';
    final autoOn = auto == '1' || auto == 'true';

    state = state.copyWith(
      voiceEnabled: voiceOn,
      autoTrading: autoOn,
      loaded: true,
    );

    final repo = _ref.read(niftyOptimaRepositoryProvider);
    await repo.setAutoTrading(autoOn);
  }

  Future<void> setVoiceEnabled(bool on, {bool speakTest = false}) async {
    state = state.copyWith(voiceEnabled: on);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_voiceKey, on ? '1' : '0');
    if (on && speakTest) {
      await _ref.read(strategyVoiceServiceProvider).speakTest(
            autoTrading: state.autoTrading,
          );
    }
  }

  Future<void> setAutoTrading(bool on, {bool speakMode = false}) async {
    state = state.copyWith(syncing: true);
    final repo = _ref.read(niftyOptimaRepositoryProvider);
    await repo.setAutoTrading(on);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_autoKey, on ? '1' : '0');
    state = state.copyWith(autoTrading: on, syncing: false);
    if (speakMode && state.voiceEnabled) {
      await _ref.read(strategyVoiceServiceProvider).speakTradingMode(on);
    }
  }

  Future<void> testVoice() async {
    if (!state.voiceEnabled) return;
    await _ref.read(strategyVoiceServiceProvider).speakTest(
          autoTrading: state.autoTrading,
        );
  }
}

final tradingSettingsProvider =
    StateNotifierProvider<TradingSettingsNotifier, TradingSettings>((ref) {
  return TradingSettingsNotifier(ref);
});
