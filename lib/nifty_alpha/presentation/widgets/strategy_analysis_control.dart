import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../niftyoptima/presentation/widgets/mstock_login_dialog.dart';
import '../../../strategy_research/data/auth/mstock_jwt_manager.dart';
import '../../../strategy_research/data/constants/strategy_research_api_keys.dart';
import '../../application/providers/nifty_alpha_providers.dart';
import '../../application/state/nifty_alpha_state.dart';

/// Full-width scan bar — placed at top of Nifty dashboard.
class StrategyScanToggleBar extends ConsumerStatefulWidget {
  const StrategyScanToggleBar({super.key});

  @override
  ConsumerState<StrategyScanToggleBar> createState() =>
      _StrategyScanToggleBarState();
}

class _StrategyScanToggleBarState extends ConsumerState<StrategyScanToggleBar> {
  final _mgr = MstockJwtManager.instance;
  bool _authBusy = false;

  Future<bool> _ensureSession() async {
    final bootstrapped = await _mgr.bootstrapIfNeeded();
    return bootstrapped && _mgr.isAuthenticated;
  }

  Future<bool> _promptLogin() async {
    final apiMissing = StrategyResearchApiKeys.apiKey.trim().isEmpty;
    final choice = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign in required'),
        content: Text(
          apiMissing
              ? 'Set MSTOCK_API_KEY in .env, then sign in to mStock to start strategy analysis.'
              : _mgr.error.isNotEmpty
                  ? '${_mgr.error}\n\nSign in to mStock to start strategy analysis.'
                  : 'Strategy analysis needs an active mStock session. Please sign in to continue.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          if (!apiMissing)
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'totp'),
              child: const Text('Auto TOTP'),
            ),
          if (!apiMissing)
            FilledButton(
              onPressed: () => Navigator.pop(ctx, 'sms'),
              child: const Text('Sign in'),
            ),
        ],
      ),
    );

    if (choice == 'totp') {
      setState(() => _authBusy = true);
      final ok = await _mgr.refreshFromTotp();
      setState(() => _authBusy = false);
      return ok && _mgr.isAuthenticated;
    }
    if (choice == 'sms') {
      if (!mounted) return false;
      return showMstockSmsLoginDialog(context);
    }
    return false;
  }

  Future<void> _handleToggle(bool value) async {
    final notifier = ref.read(niftyAlphaNotifierProvider.notifier);

    if (!value) {
      await notifier.setStrategyAnalysisEnabled(false);
      return;
    }

    setState(() => _authBusy = true);
    var sessionOk = await _ensureSession();
    setState(() => _authBusy = false);

    if (!sessionOk && mounted) {
      sessionOk = await _promptLogin();
    }

    if (sessionOk) {
      await notifier.setStrategyAnalysisEnabled(true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Strategy analysis started')),
        );
      }
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sign in to mStock to start strategy analysis'),
        ),
      );
    }

    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(niftyAlphaNotifierProvider);
    final theme = Theme.of(context);
    final on = state.signalScanActive;
    final sessionOk = _mgr.isAuthenticated;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: KSize.margin3x,
              vertical: KSize.margin2x,
            ),
            child: Row(
              children: [
                Icon(
                  on ? Icons.sensors : Icons.sensors_off,
                  size: 22,
                  color: on
                      ? theme.colorScheme.secondary
                      : theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: KSize.margin2x),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Start Analyze Strategy',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        on
                            ? 'On · every ${NiftyAlphaState.signalScanIntervalMinutes} min'
                            : 'Off · tap to start analysis',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        sessionOk
                            ? 'Mstock Session Active'
                            : 'Mstock Session Deactive',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: sessionOk ? Colors.green : Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                if (_authBusy)
                  const Padding(
                    padding: EdgeInsets.all(8),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                else
                  Switch.adaptive(
                    value: on,
                    onChanged: _handleToggle,
                  ),
              ],
            ),
          ),
        ),
        if (on) ...[
          const SizedBox(height: KSize.margin2x),
          if (sessionOk)
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: KSize.margin3x,
                vertical: KSize.margin2x,
              ),
              decoration: BoxDecoration(
                color: theme.colorScheme.secondary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(KSize.radiusDefault),
                border: Border.all(
                  color: theme.colorScheme.secondary.withValues(alpha: 0.35),
                ),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: theme.colorScheme.secondary,
                    ),
                  ),
                  const SizedBox(width: KSize.margin2x),
                  Expanded(
                    child: Text(
                      'Analyzing is working',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.secondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            Material(
              color: theme.colorScheme.errorContainer.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(KSize.radiusDefault),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: KSize.margin3x,
                  vertical: KSize.margin2x,
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.lock_outline,
                      size: 18,
                      color: theme.colorScheme.error,
                    ),
                    const SizedBox(width: KSize.margin2x),
                    Expanded(
                      child: Text(
                        'Session not active. Sign in to continue analyzing.',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _authBusy
                          ? null
                          : () async {
                              final ok = await _promptLogin();
                              if (ok && mounted) setState(() {});
                            },
                      child: const Text('Sign in'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ],
    );
  }
}
