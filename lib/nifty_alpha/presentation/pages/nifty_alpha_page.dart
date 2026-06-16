import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'nifty_alpha_shell.dart';

/// Main entry for Nifty Alpha: app bar + shell with Dashboard / Trade / Alerts.
class NiftyAlphaPage extends ConsumerWidget {
  const NiftyAlphaPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nifty Alpha'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () {},
            tooltip: 'Settings',
          ),
        ],
      ),
      body: const NiftyAlphaShell(),
    );
  }
}
