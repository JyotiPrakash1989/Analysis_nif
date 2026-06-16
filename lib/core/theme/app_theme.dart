import 'package:flutter/material.dart';

/// Nifty Alpha trading app theme.
/// Dark mode default to reduce eye strain (PRD).
class AppTheme {
  AppTheme._();

  // --- Nifty Alpha Dark (default) ---
  static const Color _naBg = Color(0xFF0D1117);
  static const Color _naSurface = Color(0xFF161B22);
  static const Color _naSurfaceVariant = Color(0xFF21262D);
  static const Color _naPrimary = Color(0xFF14B8A6); // Teal - actions
  static const Color _naProfit = Color(0xFF10B981); // Green - long/profit
  static const Color _naLoss = Color(0xFFEF4444);   // Red - short/loss
  static const Color _naAlert = Color(0xFFF59E0B);  // Amber - alerts/OI
  static const Color _naOnBg = Color(0xFFF1F5F9);
  static const Color _naOnSurfaceVariant = Color(0xFF94A3B8);
  static const Color _naBorder = Color(0xFF334155);
  static const Color _naOutline = Color(0xFF475569);

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: const ColorScheme.dark(
          primary: _naPrimary,
          onPrimary: Color(0xFF0D1117),
          primaryContainer: Color(0xFF0F766E),
          onPrimaryContainer: Color(0xFF99F6E4),
          secondary: _naProfit,
          onSecondary: Color(0xFF0D1117),
          tertiary: _naAlert,
          error: _naLoss,
          onError: Colors.white,
          surface: _naSurface,
          onSurface: _naOnBg,
          onSurfaceVariant: _naOnSurfaceVariant,
          outline: _naOutline,
          surfaceContainerHighest: _naSurfaceVariant,
        ),
        scaffoldBackgroundColor: _naBg,
        appBarTheme: const AppBarTheme(
          backgroundColor: _naBg,
          foregroundColor: _naOnBg,
          elevation: 0,
          centerTitle: true,
          surfaceTintColor: Colors.transparent,
        ),
        cardTheme: CardThemeData(
          color: _naSurface,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          margin: EdgeInsets.zero,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: _naPrimary,
            foregroundColor: _naBg,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: _naPrimary,
            foregroundColor: _naBg,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: _naBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: _naPrimary, width: 2),
          ),
          filled: true,
          fillColor: _naSurfaceVariant,
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: _naSurface,
          selectedItemColor: _naPrimary,
          unselectedItemColor: _naOnSurfaceVariant,
          type: BottomNavigationBarType.fixed,
        ),
        dividerColor: _naBorder,
      );

  // --- Legacy light theme (strategy research) ---
  static const Color _primaryGreen = Color(0xFF2E7D32);
  static const Color _primaryGreenLight = Color(0xFF4CAF50);
  static const Color _primaryGreenDark = Color(0xFF1B5E20);
  static const Color _surfaceGreen = Color(0xFFE8F5E9);

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _primaryGreen,
          primary: _primaryGreen,
          secondary: _primaryGreenLight,
          surface: _surfaceGreen,
          brightness: Brightness.light,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: _primaryGreenDark,
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: true,
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: _primaryGreen,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: _primaryGreen, width: 2),
          ),
          filled: true,
          fillColor: Colors.white,
        ),
        scaffoldBackgroundColor: _surfaceGreen,
      );

  // Nifty Alpha semantic colors (use in widgets)
  static const Color niftyProfit = _naProfit;
  static const Color niftyLoss = _naLoss;
  static const Color niftyAlert = _naAlert;
  static const Color niftySurfaceVariant = _naSurfaceVariant;
  static const Color niftyBorder = _naBorder;
}
