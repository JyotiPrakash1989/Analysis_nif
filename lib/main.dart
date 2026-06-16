import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'core/theme/app_theme.dart';
import 'niftyoptima/presentation/pages/niftyoptima_shell.dart';
import 'strategy_research/data/auth/mstock_jwt_manager.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env').catchError((_) {});
  await MstockJwtManager.instance.initialize();
  await MstockJwtManager.instance.bootstrapIfNeeded();
  runApp(
    const ProviderScope(
      child: NiftyAlphaApp(),
    ),
  );
}

class NiftyAlphaApp extends StatelessWidget {
  const NiftyAlphaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nifty Optima',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      home: const NiftyOptimaShell(),
    );
  }
}
