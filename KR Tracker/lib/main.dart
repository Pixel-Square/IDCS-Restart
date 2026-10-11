import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'state/app_state.dart';
import 'theme/app_theme.dart';
import 'screens/splash_screen.dart';
import 'services/offline_storage_service.dart';

import 'services/notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await OfflineStorageService.instance.init();
  await NotificationService.instance.initialize();
  final bool hasActiveSession = await AppState.instance.restoreSession();

  // If user is already authenticated from a previous session, check for newly added DC categories/students
  if (hasActiveSession) {
    OfflineStorageService.instance.checkForUpdates();
    NotificationService.instance.startApprovalPolling();
  }

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(KRTrackApp(initialHasSession: hasActiveSession));
}

class KRTrackApp extends StatelessWidget {
  final bool initialHasSession;
  const KRTrackApp({super.key, this.initialHasSession = false});

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;

    return ListenableBuilder(
      listenable: state,
      builder: (context, child) {
        return MaterialApp(
          title: 'KR Track',
          debugShowCheckedModeBanner: false,
          themeMode: state.themeMode, // Default is ThemeMode.light
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          home: const SplashScreen(),
        );
      },
    );
  }
}
