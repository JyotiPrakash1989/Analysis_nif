import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../application/providers/nifty_alpha_providers.dart';
import 'alerts_page.dart';
import 'dashboard_page.dart';
import 'trade_page.dart';

/// Auto-refresh interval for live Nifty and purchase strategy.
const Duration kAutoRefreshInterval = Duration(seconds: 60);

class NiftyAlphaShell extends ConsumerStatefulWidget {
  const NiftyAlphaShell({super.key});

  @override
  ConsumerState<NiftyAlphaShell> createState() => _NiftyAlphaShellState();
}

class _NiftyAlphaShellState extends ConsumerState<NiftyAlphaShell> {
  int _index = 0;
  Timer? _autoRefreshTimer;

  static const _tabs = [
    (icon: Icons.dashboard_rounded, label: 'Dashboard'),
    (icon: Icons.candlestick_chart, label: 'Trade'),
    (icon: Icons.notifications_outlined, label: 'Alerts'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _autoRefreshTimer = Timer.periodic(kAutoRefreshInterval, (_) {
        if (!mounted) return;
        ref.read(niftyAlphaNotifierProvider.notifier).refresh();
      });
    });
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      const DashboardPage(),
      const TradePage(),
      const AlertsPage(),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: _tabs
            .map((t) => NavigationDestination(
                  icon: Icon(t.icon),
                  label: t.label,
                ))
            .toList(),
      ),
    );
  }
}
