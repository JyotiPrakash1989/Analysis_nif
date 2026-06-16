import 'package:flutter/material.dart';

import '../../../nifty_alpha/presentation/pages/dashboard_page.dart';
import '../../../nifty_alpha/presentation/pages/settings_page.dart';
import '../widgets/mstock_auth_banner.dart';
import 'history_page.dart';
import 'orders_page.dart';
import 'stocks_page.dart';

enum NiftyOptimaTab { nifty, stocks, orders, history }

/// Main shell matching stat_react NiftyOptimaShell tabs.
class NiftyOptimaShell extends StatefulWidget {
  const NiftyOptimaShell({super.key});

  @override
  State<NiftyOptimaShell> createState() => _NiftyOptimaShellState();
}

class _NiftyOptimaShellState extends State<NiftyOptimaShell> {
  NiftyOptimaTab _tab = NiftyOptimaTab.nifty;
  int _authTick = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_titleFor(_tab)),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings',
            onPressed: () async {
              await Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (_) => SettingsPage(
                    onAuthChanged: () => setState(() => _authTick++),
                  ),
                ),
              );
              if (mounted) setState(() => _authTick++);
            },
          ),
          IconButton(
            icon: const Icon(Icons.info_outline),
            tooltip: 'How data works',
            onPressed: () {
              showDialog<void>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('On-device mode'),
                  content: const Text(
                    'This app runs independently on your phone.\n\n'
                    'With MSTOCK_API_KEY + MSTOCK_TOTP_SECRET in .env, the app '
                    'auto-generates TOTP and creates MSTOCK_JWT_TOKEN on launch.\n\n'
                    'If TOTP is not enabled, use SMS OTP from the login banner.\n\n'
                    'Manual and auto Nifty option orders route to mStock when logged in. '
                    'The Orders tab shows your purchases and syncs from the mStock order book.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('OK'),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          MstockAuthBanner(
            onAuthenticated: () => setState(() => _authTick++),
          ),
          Expanded(
            child: IndexedStack(
              index: _tab.index,
              children: [
                DashboardPage(key: ValueKey('dash-$_authTick')),
                StocksPage(key: ValueKey('stocks-$_authTick')),
                const OrdersPage(),
                HistoryPage(key: ValueKey('hist-$_authTick')),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab.index,
        onDestinationSelected: (i) {
          setState(() => _tab = NiftyOptimaTab.values[i]);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.candlestick_chart_outlined),
            selectedIcon: Icon(Icons.candlestick_chart),
            label: 'Nifty',
          ),
          NavigationDestination(
            icon: Icon(Icons.show_chart_outlined),
            selectedIcon: Icon(Icons.show_chart),
            label: 'Stocks',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Orders',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: 'History',
          ),
        ],
      ),
    );
  }

  String _titleFor(NiftyOptimaTab tab) {
    switch (tab) {
      case NiftyOptimaTab.nifty:
        return 'Nifty Optima';
      case NiftyOptimaTab.stocks:
        return 'Stocks';
      case NiftyOptimaTab.orders:
        return 'Orders';
      case NiftyOptimaTab.history:
        return 'History';
    }
  }
}
