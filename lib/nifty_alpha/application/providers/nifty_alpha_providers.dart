import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../niftyoptima/application/providers/niftyoptima_providers.dart';
import '../providers/trading_settings_provider.dart';
import '../state/nifty_alpha_notifier.dart';
import '../state/nifty_alpha_state.dart';

final niftyAlphaNotifierProvider =
    StateNotifierProvider<NiftyAlphaNotifier, NiftyAlphaState>((ref) {
  final repo = ref.watch(niftyOptimaRepositoryProvider);
  final voice = ref.watch(strategyVoiceServiceProvider);
  final notifier = NiftyAlphaNotifier(
    repo,
    voice: voice,
    readSettings: () => ref.read(tradingSettingsProvider),
  );
  ref.onDispose(notifier.dispose);
  return notifier;
});
