import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../../core/theme/app_theme.dart';
import '../../application/providers/nifty_alpha_providers.dart';
import '../../domain/models/analytics_snapshot.dart';

class AnalyticsDashboardCard extends ConsumerWidget {
  const AnalyticsDashboardCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(niftyAlphaNotifierProvider);
    final theme = Theme.of(context);
    final analytics = state.analytics;

    if (analytics == null) return const SizedBox.shrink();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSize.margin4x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.analytics_outlined,
                    color: theme.colorScheme.primary, size: 22),
                const SizedBox(width: KSize.margin2x),
                Text(
                  'Real-Time Analytics',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: KSize.margin4x),
            _PcrRow(pcr: analytics.pcr, zone: analytics.pcrZone),
            const SizedBox(height: KSize.margin3x),
            _MaxPainRow(strike: analytics.maxPainStrike),
            const SizedBox(height: KSize.margin3x),
            Text(
              'OI highlights',
              style: theme.textTheme.labelMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: KSize.margin2x),
            ...analytics.oiHighlights.map(
              (h) => Padding(
                padding: const EdgeInsets.only(bottom: KSize.margin2x),
                child: _OiHighlightTile(highlight: h),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PcrRow extends StatelessWidget {
  const _PcrRow({required this.pcr, required this.zone});

  final double pcr;
  final PcrZone zone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Color zoneColor = theme.colorScheme.onSurfaceVariant;
    if (zone == PcrZone.overbought) zoneColor = AppTheme.niftyLoss;
    if (zone == PcrZone.oversold) zoneColor = AppTheme.niftyProfit;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('PCR (Put-Call Ratio)', style: theme.textTheme.bodyMedium),
        Row(
          children: [
            Text(
              pcr.toStringAsFixed(2),
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: zoneColor.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                zone.label,
                style: theme.textTheme.labelSmall?.copyWith(color: zoneColor),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MaxPainRow extends StatelessWidget {
  const _MaxPainRow({required this.strike});

  final int strike;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('Max Pain', style: theme.textTheme.bodyMedium),
        Text(
          strike.toString(),
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: AppTheme.niftyAlert,
          ),
        ),
      ],
    );
  }
}

class _OiHighlightTile extends StatelessWidget {
  const _OiHighlightTile({required this.highlight});

  final OiHighlight highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: KSize.margin3x,
        vertical: KSize.margin2x,
      ),
      decoration: BoxDecoration(
        color: AppTheme.niftyAlert.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
        border: Border.all(color: AppTheme.niftyAlert.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${highlight.strike} ${highlight.optionType}',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Text(
            '${highlight.oiChangePercent.toStringAsFixed(0)}% OI',
            style: theme.textTheme.labelMedium?.copyWith(
              color: AppTheme.niftyAlert,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            highlight.label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
