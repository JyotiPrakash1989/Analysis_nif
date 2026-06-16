import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../niftyoptima/domain/entities/niftyoptima_models.dart';
import '../../application/providers/nifty_alpha_providers.dart';

class LiveSpotBanner extends ConsumerWidget {
  const LiveSpotBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(niftyAlphaNotifierProvider);
    final theme = Theme.of(context);
    final notifier = ref.read(niftyAlphaNotifierProvider.notifier);

    final ltp = state.liveNiftyLtp;
    final isLoading = state.liveNiftyLoading;
    final error = state.liveNiftyError;
    final fromCandle = state.liveNiftyFromLastCandle;
    final dayChange = state.dayChange;

    return Material(
      color: theme.colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(KSize.radiusDefault),
      child: InkWell(
        onTap: isLoading ? null : () => notifier.loadLiveNifty(),
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: KSize.margin4x,
            vertical: KSize.margin3x,
          ),
          child: Row(
            children: [
              Icon(
                Icons.show_chart,
                color: theme.colorScheme.primary,
                size: 28,
              ),
              const SizedBox(width: KSize.margin3x),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      fromCandle
                          ? 'NIFTY 50 (last close)'
                          : state.indexSource == 'public'
                              ? 'NIFTY 50 · delayed (Yahoo)'
                              : state.indexSource == 'mstock'
                                  ? 'NIFTY 50 · live'
                                  : 'NIFTY 50 · ${state.indexSource}',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    if (isLoading)
                      Text(
                        'Loading…',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary,
                        ),
                      )
                    else if (ltp != null) ...[
                      Text(
                        _formatLtp(ltp),
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      if (dayChange != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          _formatDayChange(dayChange),
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: dayChange.points >= 0
                                ? AppTheme.niftyProfit
                                : AppTheme.niftyLoss,
                          ),
                        ),
                        Text(
                          dayChange.basis == 'open' ? 'vs today open' : 'vs prev close',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ] else
                      Text(
                        error.isNotEmpty ? error : '—',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppTheme.niftyLoss,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
            if (!isLoading)
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () => notifier.loadLiveNifty(),
                tooltip: 'Refresh',
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatLtp(double v) => v.toStringAsFixed(2);

  static String _formatDayChange(NiftyDayChange dc) {
    final sign = dc.points >= 0 ? '+' : '';
    final pts = '$sign${dc.points.toStringAsFixed(2)}';
    final pctSign = dc.percent >= 0 ? '+' : '';
    final pct = '$pctSign${dc.percent.toStringAsFixed(2)}%';
    return '$pts ($pct)';
  }
}
