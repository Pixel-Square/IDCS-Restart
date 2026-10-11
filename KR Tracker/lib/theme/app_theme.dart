import 'package:flutter/material.dart';

class AppColors {
  // Vibrant Brand Accents
  static const Color primary = Color(0xFF6366F1); // Electric Violet-Indigo
  static const Color primaryDark = Color(0xFF4F46E5);
  static const Color secondary = Color(0xFFFF5E3A); // Sunset Coral
  static const Color accentCyan = Color(0xFF06B6D4); // Cyber Cyan
  static const Color accentPurple = Color(0xFFA855F7); // Neo Violet
  static const Color accentGreen = Color(0xFF10B981); // Emerald Green
  static const Color accentAmber = Color(0xFFF59E0B); // Amber warning

  // Light Mode Colors
  static const Color lightBg = Color(0xFFF4F6FB);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightCard = Color(0xFFFFFFFF);
  static const Color lightCardSecondary = Color(0xFFF8FAFC);
  static const Color lightTextPrimary = Color(0xFF0F172A);
  static const Color lightTextSecondary = Color(0xFF64748B);
  static const Color lightBorder = Color(0xFFE2E8F0);

  // Dark Mode Colors
  static const Color darkBg = Color(0xFF0B0F19);
  static const Color darkSurface = Color(0xFF111827);
  static const Color darkCard = Color(0xFF1A2234);
  static const Color darkCardSecondary = Color(0xFF141B2D);
  static const Color darkTextPrimary = Color(0xFFF8FAFC);
  static const Color darkTextSecondary = Color(0xFF94A3B8);
  static const Color darkBorder = Color(0xFF263248);

  // Gradients
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient coralGradient = LinearGradient(
    colors: [Color(0xFFFF5E3A), Color(0xFFFF8A50)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient genZGradient = LinearGradient(
    colors: [Color(0xFFEC4899), Color(0xFF8B5CF6), Color(0xFF06B6D4)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient sunriseGradient = LinearGradient(
    colors: [Color(0xFFFF7E40), Color(0xFFFFB347), Color(0xFF6366F1)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const LinearGradient darkCardGradient = LinearGradient(
    colors: [Color(0xFF1E283D), Color(0xFF131A2A)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient lightCardGradient = LinearGradient(
    colors: [Color(0xFFFFFFFF), Color(0xFFF8FAFF)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}

class AppStyles {
  // Skeuomorphic & 3D Shadow styles for Light Mode
  static List<BoxShadow> skeuoLightShadow({
    double blur = 16,
    double offset = 6,
    Color? color,
  }) {
    return [
      BoxShadow(
        color: (color ?? const Color(0xFF94A3B8)).withValues(alpha: 0.18),
        offset: Offset(offset, offset),
        blurRadius: blur,
        spreadRadius: 1,
      ),
      const BoxShadow(
        color: Colors.white,
        offset: Offset(-4, -4),
        blurRadius: 12,
        spreadRadius: 1,
      ),
    ];
  }

  // Skeuomorphic & 3D Shadow styles for Dark Mode
  static List<BoxShadow> skeuoDarkShadow({
    double blur = 20,
    double offset = 6,
    Color glowColor = const Color(0xFF6366F1),
  }) {
    return [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.7),
        offset: Offset(offset, offset),
        blurRadius: blur,
        spreadRadius: 0,
      ),
      BoxShadow(
        color: const Color(0xFF263248).withValues(alpha: 0.45),
        offset: Offset(-offset / 2, -offset / 2),
        blurRadius: blur / 2,
        spreadRadius: 0,
      ),
      BoxShadow(
        color: glowColor.withValues(alpha: 0.08),
        offset: const Offset(0, 0),
        blurRadius: blur * 1.5,
        spreadRadius: 2,
      ),
    ];
  }

  // Realistic floating 3D button shadow
  static List<BoxShadow> button3DShadow({
    required Color color,
    double elevation = 8,
  }) {
    return [
      BoxShadow(
        color: color.withValues(alpha: 0.45),
        offset: Offset(0, elevation),
        blurRadius: elevation * 2,
        spreadRadius: 0,
      ),
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.15),
        offset: const Offset(0, 2),
        blurRadius: 4,
        spreadRadius: 0,
      ),
    ];
  }
}

class AppTheme {
  static ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    scaffoldBackgroundColor: AppColors.lightBg,
    colorScheme: const ColorScheme.light(
      primary: AppColors.primary,
      secondary: AppColors.secondary,
      surface: AppColors.lightSurface,
      error: Colors.redAccent,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: AppColors.lightTextPrimary,
    ),
    fontFamily: 'Poppins',
    cardTheme: CardThemeData(
      color: AppColors.lightCard,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: AppColors.lightBorder, width: 1),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      iconTheme: IconThemeData(color: AppColors.lightTextPrimary),
      titleTextStyle: TextStyle(
        color: AppColors.lightTextPrimary,
        fontSize: 20,
        fontWeight: FontWeight.bold,
      ),
    ),
  );

  static ThemeData darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.darkBg,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.primary,
      secondary: AppColors.secondary,
      surface: AppColors.darkSurface,
      error: Colors.redAccent,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: AppColors.darkTextPrimary,
    ),
    fontFamily: 'Poppins',
    cardTheme: CardThemeData(
      color: AppColors.darkCard,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: AppColors.darkBorder, width: 1),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      iconTheme: IconThemeData(color: AppColors.darkTextPrimary),
      titleTextStyle: TextStyle(
        color: AppColors.darkTextPrimary,
        fontSize: 20,
        fontWeight: FontWeight.bold,
      ),
    ),
  );
}
