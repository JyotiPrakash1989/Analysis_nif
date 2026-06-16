import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../niftyoptima/data/local/local_market_helpers.dart';
import '../../application/providers/nifty_alpha_providers.dart';
import '../../application/providers/trading_settings_provider.dart';
import '../../application/state/nifty_alpha_state.dart';
String _awaitingSuggestionText(NiftyAlphaState state) {
  const minScore = 92;
  final ce = state.ceScore.round();
  final pe = state.peScore.round();
  if (ce >= minScore || pe >= minScore) {
    final side = ce >= pe ? 'CE' : 'PE';
    final score = ce >= pe ? ce : pe;
    return "Today's $side setup leads ($score% score) — waiting for entry, stop loss, and target.";
  }
  if (ce > 0 || pe > 0) {
    final side = ce >= pe ? 'CE' : 'PE';
    return "Tracking today's $side side (CE $ce% · PE $pe%) — need ≥ $minScore for a buy suggestion.";
  }
  return 'Waiting for today\'s CE or PE signal with entry, stop loss, and target.';
}

class SuggestedStrikeCard extends ConsumerWidget {
  const SuggestedStrikeCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(niftyAlphaNotifierProvider);
    final settings = ref.watch(tradingSettingsProvider);
    final notifier = ref.read(niftyAlphaNotifierProvider.notifier);
    final theme = Theme.of(context);
    final suggestion = state.strikeSuggestion;
    final canBuy = suggestion != null &&
        suggestion.hasTradeLevels &&
        !settings.autoTrading &&
        !state.hasPosition &&
        !state.strategyLoading;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSize.margin4x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.touch_app, color: theme.colorScheme.primary, size: 22),
                const SizedBox(width: KSize.margin2x),
                Text(
                  'Suggested Strike',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            if (suggestion != null && suggestion.hasTradeLevels) ...[
              const SizedBox(height: KSize.margin3x),
              Container(
                padding: const EdgeInsets.all(KSize.margin3x),
                decoration: BoxDecoration(
                  color: AppTheme.niftySurfaceVariant.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(KSize.radiusDefault),
                  border: Border.all(color: AppTheme.niftyBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      suggestion.displayStrike,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    if (suggestion.optionType != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          suggestion.deltaHint,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    if (suggestion.expiryDate != null) ...[
                      const SizedBox(height: KSize.margin2x),
                      _PriceRow(
                        label: 'Suggested expiry',
                        value: formatNiftyExpiryWithDay(suggestion.expiryDate!),
                        valueColor: Colors.amber.shade200,
                        stacked: true,
                      ),
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          niftyExpiryDaysHint(suggestion.expiryDate!),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.secondary,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: KSize.margin3x),
                    _PriceRow(
                      label: 'Purchase price (entry)',
                      value: '₹${suggestion.entryPrice!.toStringAsFixed(1)}',
                      valueColor: AppTheme.niftyProfit,
                    ),
                    const SizedBox(height: KSize.margin2x),
                    _PriceRow(
                      label: 'Stop loss',
                      value: '₹${suggestion.stopLoss!.toStringAsFixed(1)}',
                      valueColor: AppTheme.niftyLoss,
                    ),
                    const SizedBox(height: KSize.margin2x),
                    _PriceRow(
                      label: 'Target (1:2)',
                      value: '₹${suggestion.target!.toStringAsFixed(1)}',
                      valueColor: AppTheme.niftyProfit,
                    ),
                    if (suggestion.risk != null) ...[
                      const SizedBox(height: KSize.margin2x),
                      _PriceRow(
                        label: 'Risk (premium)',
                        value: '₹${suggestion.risk!.toStringAsFixed(1)}',
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      suggestion.reason,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        height: 1.3,
                      ),
                    ),
                    if (!state.hasPosition) ...[
                      const SizedBox(height: KSize.margin3x),
                      if (settings.autoTrading)
                        Text(
                          'Auto mode: buy is placed automatically when a signal fires.',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: Colors.green.shade300,
                            fontStyle: FontStyle.italic,
                          ),
                        )
                      else
                        FilledButton.icon(
                          onPressed: canBuy ? () => notifier.buy() : null,
                          icon: state.strategyLoading
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.add_circle_outline, size: 20),
                          label: Text(
                            state.strategyLoading
                                ? 'Placing order…'
                                : 'Buy suggested strike',
                          ),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppTheme.niftyProfit,
                            foregroundColor: Colors.white,
                          ),
                        ),
                    ],
                  ],
                ),
              ),
            ] else ...[
              const SizedBox(height: KSize.margin3x),
              Text(
                state.strategyLoading
                    ? 'Scanning for a buy setup…'
                    : _awaitingSuggestionText(state),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.label,
    required this.value,
    this.valueColor,
    this.stacked = false,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final bool stacked;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final labelStyle = theme.textTheme.bodyMedium?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
    );
    final valueStyle = theme.textTheme.titleSmall?.copyWith(
      fontWeight: FontWeight.bold,
      color: valueColor ?? theme.colorScheme.onSurface,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

    if (stacked) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: labelStyle),
          const SizedBox(height: 4),
          Text(value, style: valueStyle),
        ],
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: labelStyle),
        ),
        const SizedBox(width: KSize.margin2x),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: valueStyle,
          ),
        ),
      ],
    );
  }
}
