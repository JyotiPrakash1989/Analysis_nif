import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../strategy_research/presentation/pages/strategy_research_page.dart';
import '../../application/providers/nifty_alpha_providers.dart';
import '../../application/providers/trading_settings_provider.dart';
import '../../domain/strategy_voice_text.dart';

/// CE vs PE score comparison and link to multi-variant research.
class ProfitableStrategyPanel extends ConsumerWidget {
  const ProfitableStrategyPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(niftyAlphaNotifierProvider);
    final settings = ref.watch(tradingSettingsProvider);
    final theme = Theme.of(context);
    final ce = state.ceScore;
    final pe = state.peScore;
    final best = profitableSide(ceScore: ce, peScore: pe);
    final analysisOn = state.signalScanActive;

    if (!analysisOn) {
      return Container(
        padding: const EdgeInsets.all(KSize.margin3x),
        decoration: BoxDecoration(
          color: AppTheme.niftySurfaceVariant.withValues(alpha: 0.25),
          borderRadius: BorderRadius.circular(KSize.radiusDefault),
          border: Border.all(color: AppTheme.niftyBorder),
        ),
        child: Text(
          'Start Scanning is off. Turn it on above to find the best CE/PE setup.',
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontStyle: FontStyle.italic,
            height: 1.35,
          ),
        ),
      );
    }

    if (ce <= 0 && pe <= 0) {
      return Container(
        padding: const EdgeInsets.all(KSize.margin3x),
        decoration: BoxDecoration(
          color: AppTheme.niftySurfaceVariant.withValues(alpha: 0.25),
          borderRadius: BorderRadius.circular(KSize.radiusDefault),
          border: Border.all(color: AppTheme.niftyBorder),
        ),
        child: Text(
          'Analysis running — waiting for 15m breakout data for CE/PE scores.',
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            height: 1.35,
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(KSize.margin3x),
      decoration: BoxDecoration(
        color: AppTheme.niftySurfaceVariant.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
        border: Border.all(color: AppTheme.niftyBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                Icons.insights_outlined,
                size: 18,
                color: theme.colorScheme.secondary,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Start Scanning',
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              if (settings.voiceEnabled)
                IconButton(
                  icon: const Icon(Icons.volume_up_outlined, size: 18),
                  tooltip: 'Speak best side',
                  visualDensity: VisualDensity.compact,
                  onPressed: () => ref
                      .read(strategyVoiceServiceProvider)
                      .speakProfitableSide(ceScore: ce, peScore: pe),
                ),
            ],
          ),
          const SizedBox(height: KSize.margin2x),
          _ScoreBar(
            label: 'CE (call)',
            score: ce,
            color: AppTheme.niftyProfit,
            isBest: best.side == 'CE',
          ),
          const SizedBox(height: KSize.margin2x),
          _ScoreBar(
            label: 'PE (put)',
            score: pe,
            color: AppTheme.niftyLoss,
            isBest: best.side == 'PE',
          ),
          const SizedBox(height: KSize.margin2x),
          Text(
            best.qualifies
                ? 'More profitable today: ${best.label} (${best.score.round()}% ≥ ${minProfitableScore.round()})'
                : 'No setup ≥${minProfitableScore.round()} yet — CE ${ce.round()} · PE ${pe.round()}',
            style: theme.textTheme.labelSmall?.copyWith(
              color: best.qualifies
                  ? theme.colorScheme.secondary
                  : theme.colorScheme.onSurfaceVariant,
              fontWeight: best.qualifies ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
          const SizedBox(height: KSize.margin2x),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const StrategyResearchPage(),
                ),
              );
            },
            icon: const Icon(Icons.science_outlined, size: 18),
            label: const Text('Compare strategy variants'),
          ),
        ],
      ),
    );
  }
}

class _ScoreBar extends StatelessWidget {
  const _ScoreBar({
    required this.label,
    required this.score,
    required this.color,
    required this.isBest,
  });

  final String label;
  final double score;
  final Color color;
  final bool isBest;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fraction = (score / 100).clamp(0.0, 1.0);
    final qualifies = score >= minProfitableScore;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: isBest ? FontWeight.bold : FontWeight.normal,
              ),
            ),
            const Spacer(),
            Text(
              '${score.round()}%',
              style: theme.textTheme.labelSmall?.copyWith(
                color: qualifies ? color : theme.colorScheme.onSurfaceVariant,
                fontFeatures: const [FontFeature.tabularFigures()],
                fontWeight: FontWeight.w600,
              ),
            ),
            if (isBest && qualifies) ...[
              const SizedBox(width: 4),
              Icon(Icons.star, size: 12, color: color),
            ],
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: fraction,
            minHeight: 6,
            backgroundColor: theme.colorScheme.surfaceContainerHighest,
            color: qualifies ? color : color.withValues(alpha: 0.45),
          ),
        ),
      ],
    );
  }
}
