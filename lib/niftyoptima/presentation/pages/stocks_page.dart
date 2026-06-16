import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/k_sizes.dart';
import '../../application/providers/niftyoptima_providers.dart';
import '../../domain/entities/niftyoptima_models.dart';

class StocksPage extends ConsumerWidget {
  const StocksPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(stocksNotifierProvider);
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: () => ref.read(stocksNotifierProvider.notifier).refresh(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(KSize.margin4x),
        children: [
          Text(
            'Equity intraday analyzer',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: KSize.margin2x),
          Text(
            'On-device equity scan via mStock API',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (state.error.isNotEmpty) ...[
            const SizedBox(height: KSize.margin2x),
            Text(state.error, style: TextStyle(color: theme.colorScheme.error)),
          ],
          const SizedBox(height: KSize.margin4x),
          if (state.loading && state.ranked.isEmpty)
            const Center(child: CircularProgressIndicator())
          else if (state.topPick != null) ...[
            _TopPickCard(stock: state.topPick!),
            const SizedBox(height: KSize.margin4x),
          ],
          if (state.watchlist.isNotEmpty) ...[
            Text('Watchlist', style: theme.textTheme.labelLarge),
            const SizedBox(height: KSize.margin2x),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: state.watchlist
                  .map((s) => Chip(label: Text(s)))
                  .toList(),
            ),
            const SizedBox(height: KSize.margin4x),
          ],
          Text('Ranked suggestions', style: theme.textTheme.labelLarge),
          const SizedBox(height: KSize.margin2x),
          ...state.ranked.map((s) => _StockTile(stock: s)),
          if (!state.loading && state.ranked.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: KSize.margin6x),
              child: Center(child: Text('No stock signals yet')),
            ),
        ],
      ),
    );
  }
}

class _TopPickCard extends StatelessWidget {
  const _TopPickCard({required this.stock});

  final RankedStock stock;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final a = stock.analysis;
    return Card(
      color: theme.colorScheme.primaryContainer.withValues(alpha: 0.35),
      child: Padding(
        padding: const EdgeInsets.all(KSize.margin4x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Top pick', style: theme.textTheme.labelMedium),
            Text(
              stock.symbol,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            Text('LTP ${stock.ltp.toStringAsFixed(2)}'),
            if (a.suggestPurchase) ...[
              Text('Entry ${a.entry?.toStringAsFixed(2) ?? '—'}'),
              Text('SL ${a.sl?.toStringAsFixed(2) ?? '—'} · TGT ${a.tgt?.toStringAsFixed(2) ?? '—'}'),
            ],
            if (a.rationale != null) Text(a.rationale!, style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _StockTile extends StatelessWidget {
  const _StockTile({required this.stock});

  final RankedStock stock;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final a = stock.analysis;
    return Card(
      margin: const EdgeInsets.only(bottom: KSize.margin2x),
      child: ListTile(
        title: Text(stock.symbol, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
          a.suggestPurchase
              ? 'BUY · ${a.confidence?.toStringAsFixed(0) ?? a.score.toStringAsFixed(0)}% · ${a.rationale ?? ''}'
              : a.rationale ?? 'No setup',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(stock.ltp.toStringAsFixed(2)),
            Text(
              '${stock.rewardPct.toStringAsFixed(1)}% tgt',
              style: theme.textTheme.labelSmall,
            ),
          ],
        ),
      ),
    );
  }
}
