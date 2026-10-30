import 'package:flutter/material.dart';

class AppTheme {
  static const navy = Color(0xFF0B1320);
  static const blue = Color(0xFF1D8CF0);
  static const amber = Color(0xFFFFB703);

  static ThemeData get dark {
    final scheme = ColorScheme.fromSeed(seedColor: blue, brightness: Brightness.dark).copyWith(surface: const Color(0xFF101C2F), primary: blue);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: navy,
      appBarTheme: const AppBarTheme(backgroundColor: navy, elevation: 0, centerTitle: false),
      inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(foregroundColor: Colors.white, minimumSize: const Size.fromHeight(52), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)))),
    );
  }
}
