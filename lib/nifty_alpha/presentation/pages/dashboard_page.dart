import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/k_sizes.dart';
import '../../../strategy_research/presentation/pages/strategy_research_page.dart';
import '../../application/providers/nifty_alpha_providers.dart';
import '../widgets/analytics_dashboard_card.dart';
import '../widgets/live_spot_banner.dart';
import '../widgets/strategy_analysis_control.dart';
import '../widgets/suggested_strike_card.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () async {
        ref.read(niftyAlphaNotifierProvider.notifier).refresh();
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(KSize.margin4x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const StrategyScanToggleBar(),
            const SizedBox(height: KSize.margin3x),
            const LiveSpotBanner(),
            const SizedBox(height: KSize.margin3x),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const StrategyResearchPage(),
                  ),
                );
              },
              icon: const Icon(Icons.science_outlined, size: 20),
              label: const Text('Strategy research · live API & backtest'),
            ),
            const SizedBox(height: KSize.margin4x),
            const SuggestedStrikeCard(),
            const SizedBox(height: KSize.margin4x),
            const AnalyticsDashboardCard(),
          ],
        ),
      ),
    );
  }
}
