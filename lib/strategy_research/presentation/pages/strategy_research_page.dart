import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../../core/state/data_state.dart';
import '../../application/providers/strategy_research_providers.dart';
import '../../../niftyoptima/presentation/widgets/mstock_login_dialog.dart';
import '../../data/auth/mstock_jwt_manager.dart';
import '../../data/constants/strategy_research_api_keys.dart';
import '../../domain/entities/backtest_config_model.dart';
import '../widgets/backtest_metrics_card.dart';
import '../widgets/disclaimer_banner.dart';
import '../widgets/strategy_rules_card.dart';

class StrategyResearchPage extends ConsumerStatefulWidget {
  const StrategyResearchPage({super.key});

  @override
  ConsumerState<StrategyResearchPage> createState() =>
      _StrategyResearchPageState();
}

class _StrategyResearchPageState extends ConsumerState<StrategyResearchPage> {
  bool _checkingApi = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await MstockJwtManager.instance.bootstrapIfNeeded();
      if (!mounted) return;
      final notifier = ref.read(strategyResearchNotifierProvider.notifier);
      notifier.loadStrategyRules();
      notifier.loadLiveNifty();
    });
  }

  Future<void> _checkLiveApi() async {
    if (_checkingApi) return;
    setState(() => _checkingApi = true);
    final notifier = ref.read(strategyResearchNotifierProvider.notifier);
    final message = await notifier.checkLiveDataApi();
    if (mounted) {
      setState(() => _checkingApi = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          duration: message.startsWith('Live data API: Working')
              ? const Duration(seconds: 4)
              : const Duration(seconds: 8),
          backgroundColor: message.startsWith('Live data API: Working')
              ? Theme.of(context).colorScheme.primaryContainer
              : Theme.of(context).colorScheme.errorContainer,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(strategyResearchNotifierProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('NIFTY Intraday Strategy Research'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          final notifier = ref.read(strategyResearchNotifierProvider.notifier);
          notifier.loadStrategyRules();
          notifier.loadLiveNifty();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(KSize.margin4x),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _LiveNiftyBanner(
                ltp: state.liveNiftyLtp,
                loading: state.liveNiftyLoading,
                error: state.liveNiftyError,
                fromLastCandle: state.liveNiftyFromLastCandle,
                onRefresh: () => ref.read(strategyResearchNotifierProvider.notifier).loadLiveNifty(),
              ),
              if (!MstockJwtManager.instance.isAuthenticated) ...[
                const SizedBox(height: KSize.margin3x),
                _SessionRequiredCard(
                  onSignIn: () async {
                    final ok = await showMstockSmsLoginDialog(context);
                    if (ok && mounted) setState(() {});
                  },
                ),
              ],
              const SizedBox(height: KSize.margin4x),
              const DisclaimerBanner(),
              const SizedBox(height: KSize.margin4x),
              if (state.rulesLoading)
                const Padding(
                  padding: EdgeInsets.all(KSize.margin6x),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (state.rulesHasError)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(KSize.margin4x),
                    child: Column(
                      children: [
                        Text(
                          'Could not load strategy rules',
                          style: theme.textTheme.bodyLarge,
                        ),
                        const SizedBox(height: KSize.margin2x),
                        FilledButton.icon(
                          onPressed: () => ref
                              .read(strategyResearchNotifierProvider.notifier)
                              .loadStrategyRules(),
                          icon: const Icon(Icons.refresh),
                          label: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              else if (state.rules != null)
                StrategyRulesCard(rules: state.rules!),
              const SizedBox(height: KSize.margin4x),
              OutlinedButton.icon(
                onPressed: _checkingApi
                    ? null
                    : () => _checkLiveApi(),
                icon: _checkingApi
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.wifi_tethering),
                label: Text(_checkingApi ? 'Checking…' : 'Check live API'),
              ),
              const SizedBox(height: KSize.margin2x),
              FilledButton.icon(
                onPressed: state.backtestLoading
                    ? null
                    : () {
                        final config = const BacktestConfigModel();
                        ref
                            .read(strategyResearchNotifierProvider.notifier)
                            .runBacktest(config);
                      },
                icon: state.backtestLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.play_arrow),
                label: Text(
                  state.backtestLoading ? 'Running backtest…' : 'Run Backtest',
                ),
              ),
              const SizedBox(height: KSize.margin4x),
              if (state.backtestHasError)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(KSize.margin4x),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Backtest failed',
                          style: theme.textTheme.bodyLarge,
                        ),
                        if (state.backtestState case DataStateFailure(error: final e))
                          Padding(
                            padding: const EdgeInsets.only(top: KSize.margin2x),
                            child: Text(
                              e.toString(),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.error,
                              ),
                            ),
                          ),
                        const SizedBox(height: KSize.margin2x),
                        FilledButton(
                          onPressed: () {
                            ref
                                .read(strategyResearchNotifierProvider.notifier)
                                .runBacktest(const BacktestConfigModel());
                          },
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              else if (state.backtestSuccess && state.backtestResult != null) ...[
                if (state.backtestResult!.summary.contains('Live data unavailable') ||
                    state.backtestResult!.summary.contains('calibrated fallback'))
                  Card(
                    color: theme.colorScheme.errorContainer.withValues(alpha: 0.35),
                    child: Padding(
                      padding: const EdgeInsets.all(KSize.margin3x),
                      child: Text(
                        'Historical mStock data was not used — results below are '
                        'calibrated fallback. Fix login/API, then tap Check live API.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ),
                const SizedBox(height: KSize.margin3x),
                BacktestMetricsCard(result: state.backtestResult!),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SessionRequiredCard extends StatelessWidget {
  const _SessionRequiredCard({required this.onSignIn});

  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final totpDisabled = StrategyResearchApiKeys.totpSecret.isEmpty;
    return Card(
      color: theme.colorScheme.errorContainer.withValues(alpha: 0.35),
      child: Padding(
        padding: const EdgeInsets.all(KSize.margin3x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'mStock session required',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: KSize.margin2x),
            Text(
              totpDisabled
                  ? 'Historical data needs a session JWT. TOTP is not enabled on '
                      'your account — sign in with SMS OTP.'
                  : 'Sign in so Check live API and Run Backtest can fetch mStock candles.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: KSize.margin2x),
            FilledButton.icon(
              onPressed: onSignIn,
              icon: const Icon(Icons.login, size: 18),
              label: const Text('Sign in with SMS OTP'),
            ),
          ],
        ),
      ),
    );
  }
}

class _LiveNiftyBanner extends StatelessWidget {
  const _LiveNiftyBanner({
    required this.ltp,
    required this.loading,
    required this.error,
    required this.fromLastCandle,
    required this.onRefresh,
  });

  final double? ltp;
  final bool loading;
  final String error;
  final bool fromLastCandle;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: theme.colorScheme.primaryContainer.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(KSize.radiusDefault),
      child: InkWell(
        onTap: loading ? null : onRefresh,
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
                      fromLastCandle ? 'NIFTY 50 (last close)' : 'Live NIFTY 50',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    if (loading)
                      Text(
                        'Loading…',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary,
                        ),
                      )
                    else if (ltp != null)
                      Text(
                        _formatPrice(ltp!),
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary,
                        ),
                      )
                    else
                      Text(
                        error.isNotEmpty ? error : '—',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                  ],
                ),
              ),
              if (!loading)
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: onRefresh,
                  tooltip: 'Refresh',
                ),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatPrice(double v) {
    if (v >= 1000) {
      return v.toStringAsFixed(2);
    }
    return v.toStringAsFixed(2);
  }
}
