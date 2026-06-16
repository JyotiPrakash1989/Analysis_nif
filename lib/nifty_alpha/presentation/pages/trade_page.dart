import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../../core/theme/app_theme.dart';
import '../widgets/live_spot_banner.dart';
import '../widgets/suggested_strike_card.dart';

class TradePage extends ConsumerWidget {
  const TradePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(KSize.margin4x),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const LiveSpotBanner(),
          const SizedBox(height: KSize.margin4x),
          _ChartPlaceholder(),
          const SizedBox(height: KSize.margin4x),
          const SuggestedStrikeCard(),
          const SizedBox(height: KSize.margin4x),
          OutlinedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.layers, size: 18),
            label: const Text('Basket order (e.g. Bull Call Spread)'),
          ),
          const SizedBox(height: KSize.margin4x),
          _RiskDisclaimer(),
        ],
      ),
    );
  }
}

class _RiskDisclaimer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      'Options are high-risk. Consider spreads for higher Probability of Profit.',
      style: theme.textTheme.bodySmall?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
        fontStyle: FontStyle.italic,
      ),
      textAlign: TextAlign.center,
    );
  }
}

class _ChartPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      height: 200,
      decoration: BoxDecoration(
        color: AppTheme.niftySurfaceVariant,
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
        border: Border.all(color: AppTheme.niftyBorder),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.candlestick_chart,
              size: 48,
              color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 8),
            Text(
              'Chart • VWAP, RSI(9), Supertrend',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
