import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../application/providers/trading_settings_provider.dart';

/// Manual vs Auto order mode (mirrors stat_react TradingModeControl).
class TradingModeControl extends ConsumerWidget {
  const TradingModeControl({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(tradingSettingsProvider);
    final notifier = ref.read(tradingSettingsProvider.notifier);
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(KSize.margin3x),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'ORDER MODE',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.bold,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: KSize.margin2x),
          Row(
            children: [
              Expanded(
                child: _ModeButton(
                  label: 'Manual',
                  selected: !settings.autoTrading,
                  selectedColor: theme.colorScheme.primary,
                  onTap: settings.syncing
                      ? null
                      : () => notifier.setAutoTrading(
                            false,
                            speakMode: settings.voiceEnabled,
                          ),
                ),
              ),
              const SizedBox(width: KSize.margin2x),
              Expanded(
                child: _ModeButton(
                  label: 'Auto',
                  selected: settings.autoTrading,
                  selectedColor: Colors.green.shade500,
                  onTap: settings.syncing
                      ? null
                      : () => notifier.setAutoTrading(
                            true,
                            speakMode: settings.voiceEnabled,
                          ),
                ),
              ),
            ],
          ),
          const SizedBox(height: KSize.margin2x),
          Text(
            settings.autoTrading
                ? 'Auto: places buy on today\'s signal. Exits when LTP ≥ target or LTP ≤ stop-loss.'
                : 'Manual: tap Buy to enter. Target and stop-loss exits run on LTP.',
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  const _ModeButton({
    required this.label,
    required this.selected,
    required this.selectedColor,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Color selectedColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: selected
          ? selectedColor
          : theme.colorScheme.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(KSize.radiusDefault),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(KSize.radiusDefault),
            border: selected
                ? null
                : Border.all(
                    color: theme.colorScheme.outline.withValues(alpha: 0.3),
                  ),
          ),
          child: Text(
            label,
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.bold,
              color: selected
                  ? (selectedColor.computeLuminance() > 0.5
                      ? Colors.black
                      : Colors.white)
                  : theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}
