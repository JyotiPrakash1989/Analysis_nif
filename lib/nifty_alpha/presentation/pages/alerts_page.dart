import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../../core/theme/app_theme.dart';

class AlertsPage extends ConsumerWidget {
  const AlertsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    final alerts = [
      ('Nifty 25500 CE', '200% OI surge – Possible breakout', true),
      ('Max Pain', 'Shifted to 24400', false),
      ('PCR', 'Moved to oversold zone', false),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(KSize.margin4x),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Push notifications for OI spikes and key levels',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: KSize.margin4x),
          ...alerts.map((a) => Padding(
                padding: const EdgeInsets.only(bottom: KSize.margin3x),
                child: _AlertTile(
                  title: a.$1,
                  subtitle: a.$2,
                  isOiSpike: a.$3,
                ),
              )),
          const SizedBox(height: KSize.margin4x),
          FilledButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.notifications_active),
            label: const Text('Manage alert rules'),
          ),
        ],
      ),
    );
  }
}

class _AlertTile extends StatelessWidget {
  const _AlertTile({
    required this.title,
    required this.subtitle,
    required this.isOiSpike,
  });

  final String title;
  final String subtitle;
  final bool isOiSpike;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: KSize.margin4x,
          vertical: KSize.margin2x,
        ),
        leading: CircleAvatar(
          backgroundColor: isOiSpike
              ? AppTheme.niftyAlert.withValues(alpha: 0.3)
              : theme.colorScheme.surfaceContainerHighest,
          child: Icon(
            isOiSpike ? Icons.trending_up : Icons.info_outline,
            color: isOiSpike ? AppTheme.niftyAlert : theme.colorScheme.primary,
            size: 22,
          ),
        ),
        title: Text(
          title,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}
