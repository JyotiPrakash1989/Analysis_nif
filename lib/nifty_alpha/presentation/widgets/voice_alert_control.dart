import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../application/providers/trading_settings_provider.dart';

/// Voice on/off toggle with test button (mirrors stat_react VoiceAlertControl).
class VoiceAlertControl extends ConsumerWidget {
  const VoiceAlertControl({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(tradingSettingsProvider);
    final notifier = ref.read(tradingSettingsProvider.notifier);
    final theme = Theme.of(context);

    return Row(
        children: [
          Checkbox(
            value: settings.voiceEnabled,
            onChanged: (v) {
              if (v == null) return;
              notifier.setVoiceEnabled(v, speakTest: v);
            },
            visualDensity: VisualDensity.compact,
          ),
          Expanded(
            child: GestureDetector(
              onTap: () => notifier.setVoiceEnabled(
                !settings.voiceEnabled,
                speakTest: !settings.voiceEnabled,
              ),
              child: Text(
                'Voice alerts (signal, buy, target, stop loss)',
                style: theme.textTheme.labelMedium,
              ),
            ),
          ),
          if (settings.voiceEnabled)
            TextButton(
              onPressed: notifier.testVoice,
              style: TextButton.styleFrom(
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              child: const Text('Test'),
            ),
        ],
    );
  }
}
