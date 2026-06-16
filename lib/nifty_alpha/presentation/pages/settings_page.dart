import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../niftyoptima/presentation/widgets/mstock_account_card.dart';
import '../widgets/purchase_strategy_card.dart';
import '../widgets/trading_mode_control.dart';
import '../widgets/voice_alert_control.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key, this.onAuthChanged});

  final VoidCallback? onAuthChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(KSize.margin4x),
        children: [
          Text(
            'Strategy signals',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: theme.colorScheme.secondary,
            ),
          ),
          const SizedBox(height: KSize.margin2x),
          const PurchaseStrategyCard(),
          const SizedBox(height: KSize.margin4x),
          Text(
            'Trading',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: theme.colorScheme.secondary,
            ),
          ),
          const SizedBox(height: KSize.margin2x),
          const TradingModeControl(),
          const SizedBox(height: KSize.margin4x),
          Text(
            'Alerts',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: theme.colorScheme.secondary,
            ),
          ),
          const SizedBox(height: KSize.margin2x),
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: KSize.margin3x,
                vertical: KSize.margin2x,
              ),
              child: const VoiceAlertControl(),
            ),
          ),
          const SizedBox(height: KSize.margin4x),
          Text(
            'mStock account',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: theme.colorScheme.secondary,
            ),
          ),
          const SizedBox(height: KSize.margin2x),
          MstockAccountCard(onAuthChanged: onAuthChanged),
        ],
      ),
    );
  }
}
