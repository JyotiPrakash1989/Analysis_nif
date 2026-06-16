import 'package:flutter/material.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../domain/entities/backtest_result_model.dart';

class BacktestMetricsCard extends StatelessWidget {
  const BacktestMetricsCard({super.key, required this.result});

  final BacktestResultModel result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSize.margin4x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Performance Metrics',
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (result.optionRecommendation != null) ...[
              const SizedBox(height: KSize.margin4x),
              _OptionRecommendationLabel(
                recommendation: result.optionRecommendation!,
                strikePrice: result.recommendedStrikePrice,
                optionPrice: result.recommendedOptionPrice,
                entryPrice: result.optionEntryPrice,
                exitPrice: result.optionExitPrice,
                stopLoss: result.optionStopLoss,
                expiryDate: result.recommendedExpiryDate,
              ),
            ],
            const SizedBox(height: KSize.margin4x),
            Wrap(
              spacing: KSize.margin4x,
              runSpacing: KSize.margin3x,
              children: [
                _MetricChip(
                  label: 'Win Rate',
                  value: '${result.winRate.toStringAsFixed(1)}%',
                ),
                _MetricChip(
                  label: 'Total Trades',
                  value: '${result.totalTrades}',
                ),
                _MetricChip(
                  label: 'Winning Trades',
                  value: '${result.winningTrades}',
                ),
                _MetricChip(
                  label: 'Max Drawdown',
                  value: '${result.maxDrawdownPercent.toStringAsFixed(1)}%',
                ),
                _MetricChip(
                  label: 'Risk-Reward',
                  value: result.riskRewardRatio.toStringAsFixed(2),
                ),
                _MetricChip(
                  label: 'Net P&L %',
                  value: '${result.netPnl.toStringAsFixed(1)}%',
                ),
              ],
            ),
            if (result.summary.isNotEmpty) ...[
              const SizedBox(height: KSize.margin3x),
              Text(
                result.summary,
                style: theme.textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Label showing NIFTY option recommended for purchase: strike, prices, stop loss, expiry.
class _OptionRecommendationLabel extends StatelessWidget {
  const _OptionRecommendationLabel({
    required this.recommendation,
    this.strikePrice,
    this.optionPrice,
    this.entryPrice,
    this.exitPrice,
    this.stopLoss,
    this.expiryDate,
  });

  final OptionRecommendation recommendation;
  final int? strikePrice;
  final double? optionPrice;
  final double? entryPrice;
  final double? exitPrice;
  final double? stopLoss;
  final DateTime? expiryDate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCall = recommendation == OptionRecommendation.call;
    final optionLabel = isCall ? 'NIFTY CALL' : 'NIFTY PUT';
    final hasDetails = strikePrice != null ||
        optionPrice != null ||
        entryPrice != null ||
        exitPrice != null ||
        stopLoss != null ||
        expiryDate != null;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: KSize.margin4x,
        vertical: KSize.margin3x,
      ),
      decoration: BoxDecoration(
        color: isCall
            ? theme.colorScheme.primaryContainer.withValues(alpha: 0.6)
            : theme.colorScheme.errorContainer.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
        border: Border.all(
          color: isCall
              ? theme.colorScheme.primary.withValues(alpha: 0.5)
              : theme.colorScheme.error.withValues(alpha: 0.5),
          width: 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Recommendation for purchase (after analysis of past data)',
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: KSize.margin1x),
          Text(
            optionLabel,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
              color: isCall
                  ? theme.colorScheme.primary
                  : theme.colorScheme.error,
            ),
          ),
          if (hasDetails) ...[
            const SizedBox(height: KSize.margin3x),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: _buildDetailRows(theme)
                  .map((w) => Padding(
                        padding: const EdgeInsets.only(bottom: KSize.margin2x),
                        child: w,
                      ))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _buildDetailRows(ThemeData theme) {
    final rows = <Widget>[];
    if (strikePrice != null) {
      rows.add(_RecommendationRow(
        label: 'Strike price',
        value: strikePrice!.toString(),
        theme: theme,
      ));
    }
    if (optionPrice != null) {
      rows.add(_RecommendationRow(
        label: 'Option price',
        value: '₹${optionPrice!.toStringAsFixed(2)}',
        theme: theme,
      ));
    }
    if (entryPrice != null) {
      rows.add(_RecommendationRow(
        label: 'Entry price',
        value: '₹${entryPrice!.toStringAsFixed(2)}',
        theme: theme,
      ));
    }
    if (exitPrice != null) {
      rows.add(_RecommendationRow(
        label: 'Exit price',
        value: '₹${exitPrice!.toStringAsFixed(2)}',
        theme: theme,
      ));
    }
    if (stopLoss != null) {
      rows.add(_RecommendationRow(
        label: 'Stop loss',
        value: '₹${stopLoss!.toStringAsFixed(2)}',
        theme: theme,
      ));
    }
    if (expiryDate != null) {
      final d = expiryDate!;
      final formatted = '${d.day.toString().padLeft(2, '0')} ${_monthName(d.month)} ${d.year}';
      rows.add(_RecommendationRow(
        label: 'Expiry date (purchase this expiry)',
        value: formatted,
        theme: theme,
      ));
    }
    return rows;
  }

  static String _monthName(int month) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  }
}

class _RecommendationRow extends StatelessWidget {
  const _RecommendationRow({
    required this.label,
    required this.value,
    required this.theme,
  });

  final String label;
  final String value;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: theme.textTheme.bodyMedium?.copyWith(
          color: theme.colorScheme.onSurface,
        ),
        children: [
          TextSpan(
            text: '$label: ',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w500,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          TextSpan(
            text: value,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: KSize.margin3x,
        vertical: KSize.margin2x,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: theme.textTheme.labelSmall,
          ),
          Text(
            value,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
