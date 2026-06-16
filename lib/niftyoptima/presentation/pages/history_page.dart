import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/k_sizes.dart';
import '../../application/providers/niftyoptima_providers.dart';
import '../../domain/entities/niftyoptima_models.dart';

class HistoryPage extends ConsumerWidget {
  const HistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(historyNotifierProvider);
    final theme = Theme.of(context);
    final latest = state.bars.isNotEmpty ? state.bars.last : null;

    return RefreshIndicator(
      onRefresh: () => ref.read(historyNotifierProvider.notifier).refresh(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(KSize.margin4x),
        children: [
          Text(
            'Nifty 50 · last ${state.tradingDays} sessions',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: KSize.margin2x),
          Text(
            latest != null ? latest.close.toStringAsFixed(2) : '—',
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.bold,
              color: theme.colorScheme.primary,
            ),
          ),
          Text(
            state.bars.isNotEmpty
                ? 'mStock Type B (on-device historical API)'
                : state.indexError.isNotEmpty
                    ? state.indexError
                    : 'Loading…',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: KSize.margin4x),
          if (state.loading && state.bars.isEmpty)
            const Center(child: CircularProgressIndicator())
          else
            ...state.bars.reversed.map((b) => _DayBarTile(bar: b)),
        ],
      ),
    );
  }
}

class _DayBarTile extends StatelessWidget {
  const _DayBarTile({required this.bar});

  final MinuteBar bar;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = DateTime.fromMillisecondsSinceEpoch(bar.time);
    return Card(
      margin: const EdgeInsets.only(bottom: KSize.margin2x),
      child: ListTile(
        title: Text(
          '${date.day}/${date.month}/${date.year}',
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          'O ${bar.open.toStringAsFixed(2)} · H ${bar.high.toStringAsFixed(2)} · '
          'L ${bar.low.toStringAsFixed(2)} · C ${bar.close.toStringAsFixed(2)}',
        ),
        trailing: Text(
          bar.close.toStringAsFixed(2),
          style: theme.textTheme.titleMedium?.copyWith(
            color: theme.colorScheme.primary,
          ),
        ),
      ),
    );
  }
}
