import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/k_sizes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../nifty_alpha/application/providers/nifty_alpha_providers.dart';
import '../../application/providers/niftyoptima_providers.dart';
import '../../data/constants/niftyoptima_api_config.dart';
import '../../domain/entities/niftyoptima_models.dart';

class OrdersPage extends ConsumerWidget {
  const OrdersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(ordersNotifierProvider);
    final alpha = ref.watch(niftyAlphaNotifierProvider);
    final theme = Theme.of(context);
    final purchases = state.logs
        .where((l) => l.action == 'BUY')
        .toList()
        .reversed
        .toList();

    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(ordersNotifierProvider.notifier).refresh();
        ref.read(niftyAlphaNotifierProvider.notifier).refresh();
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(KSize.margin4x),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Purchased orders · ${state.day.isEmpty ? 'today' : state.day}',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              if (state.autoTrading == true)
                const Chip(
                  label: Text('Auto'),
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
          const SizedBox(height: KSize.margin2x),
          Text(
            'Open positions appear here with entry, target, and sell.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: KSize.margin4x),
          if (state.syncError.isNotEmpty) ...[
            Text(
              state.syncError,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
            if (NiftyOptimaApiConfig.hasRemoteBackend) ...[
              const SizedBox(height: KSize.margin2x),
              Text(
                'Server: ${NiftyOptimaApiConfig.baseUrl}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: KSize.margin4x),
          ],
          if (state.loading && purchases.isEmpty)
            const Center(child: CircularProgressIndicator())
          else if (purchases.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: KSize.margin6x),
              child: Center(
                child: Text(
                  state.logs.isEmpty
                      ? 'No purchased orders today'
                      : 'No buy orders for this session',
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else
            ...purchases.map(
              (e) => _PurchaseOrderTile(
                entry: e,
                allLogs: state.logs,
                liveLtp: alpha.currentPrice,
                openOrderId: alpha.openOrderId,
                selling: alpha.strategyLoading && alpha.hasPosition,
              ),
            ),
          if (purchases.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: KSize.margin2x),
              child: Text(
                'Pull down to refresh · syncs live status from mStock order book.',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    );
  }
}

class _PurchaseOrderTile extends ConsumerWidget {
  const _PurchaseOrderTile({
    required this.entry,
    required this.allLogs,
    required this.liveLtp,
    required this.openOrderId,
    required this.selling,
  });

  final OrderLogEntry entry;
  final List<OrderLogEntry> allLogs;
  final double? liveLtp;
  final String? openOrderId;
  final bool selling;

  OrderLogEntry? get _sell {
    final buyId = entry.orderId ?? entry.id;
    for (var i = allLogs.length - 1; i >= 0; i--) {
      final log = allLogs[i];
      if (log.action == 'SELL' && log.parentBuyId == buyId) return log;
    }
    return null;
  }

  bool get _isOpen => _sell == null;

  bool get _isActiveOpen {
    if (!_isOpen) return false;
    final id = entry.orderId ?? entry.id;
    return openOrderId == null || openOrderId == id;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final sell = _sell;
    final isEquity = entry.assetType == 'equity' || entry.optionType == 'EQ';
    final label = isEquity && entry.equitySymbol != null
        ? entry.equitySymbol!
        : 'NIFTY ${entry.strike} ${entry.optionType}';
    final time = DateTime.fromMillisecondsSinceEpoch(entry.ts);
    final ltp = _isActiveOpen ? liveLtp : entry.ltp;

    return Card(
      margin: const EdgeInsets.only(bottom: KSize.margin2x),
      child: Padding(
        padding: const EdgeInsets.all(KSize.margin3x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                _StatusChip(open: _isOpen, status: entry.status),
              ],
            ),
            const SizedBox(height: KSize.margin2x),
            Text(
              '${entry.mode} buy · ${time.hour.toString().padLeft(2, '0')}:'
              '${time.minute.toString().padLeft(2, '0')}',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: KSize.margin2x),
            _DetailRow(
              label: 'Entry',
              value: '₹${entry.entry?.toStringAsFixed(1) ?? '—'}',
            ),
            if (_isOpen && ltp != null)
              _DetailRow(
                label: 'LTP',
                value: '₹${ltp.toStringAsFixed(1)}',
              ),
            _DetailRow(
              label: 'Stop loss',
              value: '₹${entry.sl?.toStringAsFixed(1) ?? '—'}',
            ),
            _DetailRow(
              label: 'Target',
              value: '₹${entry.tgt?.toStringAsFixed(1) ?? '—'}',
            ),
            if (entry.message != null && entry.message!.isNotEmpty) ...[
              const SizedBox(height: KSize.margin2x),
              Text(
                entry.message!,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            if (sell != null) ...[
              const SizedBox(height: KSize.margin2x),
              _DetailRow(
                label: 'Exit (${sell.trigger})',
                value: '₹${sell.exitPrice?.toStringAsFixed(1) ?? '—'}',
                valueColor: AppTheme.niftyProfit,
              ),
            ],
            if (_isActiveOpen) ...[
              const SizedBox(height: KSize.margin3x),
              FilledButton.icon(
                onPressed: selling
                    ? null
                    : () => ref.read(niftyAlphaNotifierProvider.notifier).sell(),
                icon: selling
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.sell_outlined, size: 20),
                label: Text(selling ? 'Selling…' : 'Sell $label'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.niftyLoss,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.open, required this.status});

  final bool open;
  final String status;

  @override
  Widget build(BuildContext context) {
    final label = !open
        ? 'Closed'
        : status == 'failed'
            ? 'Failed'
            : status == 'submitted'
                ? 'Submitted'
                : status == 'simulated'
                    ? 'Simulated'
                    : 'Open';
    final failed = status == 'failed';
    return Chip(
      label: Text(
        label,
        style: TextStyle(
          color: failed
              ? Colors.red.shade900
              : open
                  ? Colors.amber.shade900
                  : Colors.green.shade900,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
      backgroundColor: failed
          ? Colors.red.withValues(alpha: 0.15)
          : open
              ? Colors.amber.withValues(alpha: 0.2)
              : Colors.green.withValues(alpha: 0.2),
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          Text(
            value,
            style: theme.textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: valueColor ?? theme.colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
