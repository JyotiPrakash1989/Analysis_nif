import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../niftyoptima/data/local/breakout_analysis.dart';
import '../../application/providers/nifty_alpha_providers.dart';
import '../../application/state/nifty_alpha_state.dart';
import '../../domain/models/analytics_snapshot.dart';
import '../../domain/strategy_voice_text.dart';

/// Lists the signals the app uses to identify a profitable buy setup.
class PurchaseStrategyCard extends ConsumerWidget {
  const PurchaseStrategyCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(niftyAlphaNotifierProvider);
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSize.margin4x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  Icons.assignment_outlined,
                  color: theme.colorScheme.primary,
                  size: 22,
                ),
                const SizedBox(width: KSize.margin2x),
                Expanded(
                  child: Text(
                    'Purchase strategy',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: KSize.margin2x),
            Text(
              'Signals scanned every ${NiftyAlphaState.signalScanIntervalMinutes} min to find the most profitable buy setup.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.35,
              ),
            ),
            const SizedBox(height: KSize.margin3x),
            if (!state.signalScanActive)
              _InfoBanner(
                text: 'Start Scanning is off. Turn it on from the Nifty tab to evaluate these signals.',
                color: theme.colorScheme.onSurfaceVariant,
              )
            else ...[
              _BreakoutFactor(state: state, theme: theme),
              const SizedBox(height: KSize.margin2x),
              _RsiFactor(state: state, theme: theme),
              const SizedBox(height: KSize.margin2x),
              _ProfitScoreFactor(state: state, theme: theme),
              const SizedBox(height: KSize.margin2x),
              _PcrFactor(state: state, theme: theme),
              const SizedBox(height: KSize.margin2x),
              _OiFactor(state: state, theme: theme),
              if (state.lastSignalCheckAt != null) ...[
                const SizedBox(height: KSize.margin3x),
                Text(
                  'Last scan: ${_formatTime(state.lastSignalCheckAt!)}'
                  '${state.socketConnected ? ' · live' : ''}',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.secondary,
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _BreakoutFactor extends StatelessWidget {
  const _BreakoutFactor({required this.state, required this.theme});

  final NiftyAlphaState state;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final ce = state.strategyRules?['ce'];
    final pe = state.strategyRules?['pe'];
    final ceMet = ce?.brokeUp == true;
    final peMet = pe?.brokeDown == true;

    String live;
    if (ce == null && pe == null) {
      live = 'Waiting for 15m candle data…';
    } else {
      final parts = <String>[
        'CE: ${ceMet ? 'break above prior 15m high' : 'no breakout'}',
        'PE: ${peMet ? 'break below prior 15m low' : 'no breakout'}',
      ];
      live = parts.join(' · ');
    }

    return _SignalFactorTile(
      theme: theme,
      title: '15-minute breakout',
      criterion:
          'Call setup needs spot above the prior 15m high; put setup needs spot below the prior 15m low (with close confirmation).',
      liveStatus: live,
      met: ceMet || peMet,
      partial: ce != null || pe != null,
    );
  }
}

class _RsiFactor extends StatelessWidget {
  const _RsiFactor({required this.state, required this.theme});

  final NiftyAlphaState state;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final ce = state.strategyRules?['ce'];
    final pe = state.strategyRules?['pe'];
    final rsi = state.liveRsi;
    final ceMet = ce?.rsiOk == true;
    final peMet = pe?.rsiOk == true;

    String live;
    if (rsi == null) {
      live = 'RSI loading from 1m candles…';
    } else {
      live =
          'RSI ${rsi.toStringAsFixed(1)} — CE ${ceMet ? '≥ $ceRsiBreakoutMin ✓' : 'needs ≥ $ceRsiBreakoutMin'} · '
          'PE ${peMet ? '≤ $peRsiBreakoutMax ✓' : 'needs ≤ $peRsiBreakoutMax'}';
    }

    return _SignalFactorTile(
      theme: theme,
      title: 'RSI momentum',
      criterion:
          'RSI (14) filters direction: calls need RSI ≥ $ceRsiBreakoutMin, puts need RSI ≤ $peRsiBreakoutMax.',
      liveStatus: live,
      met: ceMet || peMet,
      partial: rsi != null,
    );
  }
}

class _ProfitScoreFactor extends StatelessWidget {
  const _ProfitScoreFactor({required this.state, required this.theme});

  final NiftyAlphaState state;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final ce = state.ceScore;
    final pe = state.peScore;
    final ceOk = ce >= minProfitableScore;
    final peOk = pe >= minProfitableScore;
    final best = ce >= pe ? 'CE' : 'PE';
    final bestScore = ce >= pe ? ce : pe;

    String live;
    if (ce <= 0 && pe <= 0) {
      live = 'Scoring breakout strength, RSI edge, range position, and close confirmation…';
    } else if (ceOk || peOk) {
      live =
          'CE ${ce.round()}% · PE ${pe.round()}% — $best ${bestScore.round()}% qualifies (≥ ${minProfitableScore.round()})';
    } else {
      live =
          'CE ${ce.round()}% · PE ${pe.round()}% — need ≥ ${minProfitableScore.round()} on the best side';
    }

    return _SignalFactorTile(
      theme: theme,
      title: 'Profitability score',
      criterion:
          'Composite 0–100 score from RSI strength, points beyond breakout, candle range position, and prior-close confirmation. Best side ≥ ${minProfitableScore.round()} triggers a buy signal.',
      liveStatus: live,
      met: ceOk || peOk,
      partial: ce > 0 || pe > 0,
    );
  }
}

class _PcrFactor extends StatelessWidget {
  const _PcrFactor({required this.state, required this.theme});

  final NiftyAlphaState state;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final analytics = state.analytics;
    if (analytics == null) {
      return _SignalFactorTile(
        theme: theme,
        title: 'PCR (Put-Call ratio)',
        criterion:
            'Put OI ÷ Call OI from the option chain — oversold zone (>1.2) supports calls; overbought (<0.8) supports puts.',
        liveStatus: 'Waiting for option chain…',
        met: false,
        partial: false,
      );
    }

    return _SignalFactorTile(
      theme: theme,
      title: 'PCR (Put-Call ratio)',
      criterion:
          'Put OI ÷ Call OI from the option chain — oversold zone (>1.2) supports calls; overbought (<0.8) supports puts.',
      liveStatus:
          'PCR ${analytics.pcr.toStringAsFixed(2)} — ${analytics.pcrZone.label}',
      met: analytics.pcrZone != PcrZone.neutral,
      partial: true,
    );
  }
}

class _OiFactor extends StatelessWidget {
  const _OiFactor({required this.state, required this.theme});

  final NiftyAlphaState state;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final highlights = state.analytics?.oiHighlights ?? const [];
    if (highlights.isEmpty) {
      return _SignalFactorTile(
        theme: theme,
        title: 'Open interest (OI)',
        criterion:
            'Strikes with ≥50% OI change are flagged — long build-up, short covering, support build-up, or unwinding.',
        liveStatus: 'No large OI moves on chain yet',
        met: false,
        partial: state.analytics != null,
      );
    }

    final top = highlights.take(2).map((h) {
      return '${h.strike} ${h.optionType} ${h.oiChangePercent.abs().round()}% ${h.label}';
    }).join(' · ');

    return _SignalFactorTile(
      theme: theme,
      title: 'Open interest (OI)',
      criterion:
          'Strikes with ≥50% OI change are flagged — long build-up, short covering, support build-up, or unwinding.',
      liveStatus: top,
      met: true,
      partial: true,
    );
  }
}

class _SignalFactorTile extends StatelessWidget {
  const _SignalFactorTile({
    required this.theme,
    required this.title,
    required this.criterion,
    required this.liveStatus,
    required this.met,
    required this.partial,
  });

  final ThemeData theme;
  final String title;
  final String criterion;
  final String liveStatus;
  final bool met;
  final bool partial;

  @override
  Widget build(BuildContext context) {
    final iconColor = met
        ? AppTheme.niftyProfit
        : partial
            ? theme.colorScheme.secondary
            : theme.colorScheme.onSurfaceVariant;
    final icon = met
        ? Icons.check_circle_outline
        : partial
            ? Icons.radio_button_checked_outlined
            : Icons.radio_button_unchecked;

    return Container(
      padding: const EdgeInsets.all(KSize.margin3x),
      decoration: BoxDecoration(
        color: AppTheme.niftySurfaceVariant.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
        border: Border.all(
          color: met
              ? AppTheme.niftyProfit.withValues(alpha: 0.35)
              : AppTheme.niftyBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 18, color: iconColor),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            criterion,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            liveStatus,
            style: theme.textTheme.labelSmall?.copyWith(
              color: met ? AppTheme.niftyProfit : theme.colorScheme.secondary,
              fontWeight: met ? FontWeight.w600 : FontWeight.normal,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(KSize.margin3x),
      decoration: BoxDecoration(
        color: AppTheme.niftySurfaceVariant.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(KSize.radiusDefault),
      ),
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: color,
              fontStyle: FontStyle.italic,
              height: 1.35,
            ),
      ),
    );
  }
}
