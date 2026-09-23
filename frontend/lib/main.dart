import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/history_screen.dart';
import 'screens/login_screen.dart';
import 'screens/guest_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/sos_screen.dart';
import 'screens/splash_screen.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const DeviApp());
}

class DeviApp extends StatelessWidget {
  const DeviApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
        systemNavigationBarColor: Colors.white,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: MaterialApp(
        title: 'DEVI Women Safety',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        builder: (context, child) {
          return AnnotatedRegion<SystemUiOverlayStyle>(
            value: const SystemUiOverlayStyle(
              statusBarColor: Colors.transparent,
              statusBarIconBrightness: Brightness.dark,
              statusBarBrightness: Brightness.light,
              systemNavigationBarColor: Colors.white,
              systemNavigationBarIconBrightness: Brightness.dark,
            ),
            child: child ?? const SizedBox.shrink(),
          );
        },
        home: const SplashScreen(),
        routes: {
          '/login': (context) => const LoginScreen(),
          '/profile': (context) => const ProfileScreen(),
          '/sos': (context) => const SosScreen(),
          '/settings': (context) => const SettingsScreen(),
          '/guest': (context) => const GuestScreen(),
          '/no-contacts': (context) => const GuestScreen(),
          '/history': (context) => const HistoryScreen(),
        },
      ),
    );
  }
}
