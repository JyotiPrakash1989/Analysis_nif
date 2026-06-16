import 'package:flutter/material.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../domain/entities/strategy_rule_model.dart';

class StrategyRulesCard extends StatelessWidget {
  const StrategyRulesCard({super.key, required this.rules});

  final StrategyRuleModel rules;

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
              'Strategy Rules',
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: KSize.margin3x),
            _RuleRow(label: 'Entry', text: rules.entryDescription),
            const SizedBox(height: KSize.margin2x),
            _RuleRow(label: 'Stop-loss', text: rules.stopLossDescription),
            const SizedBox(height: KSize.margin2x),
            _RuleRow(label: 'Exit', text: rules.exitDescription),
          ],
        ),
      ),
    );
  }
}

class _RuleRow extends StatelessWidget {
  const _RuleRow({required this.label, required this.text});

  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 80,
          child: Text(
            '$label:',
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodyMedium,
          ),
        ),
      ],
    );
  }
}
