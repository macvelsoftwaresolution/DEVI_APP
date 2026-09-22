import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/history_screen.dart';
import 'screens/login_screen.dart';
import 'screens/no_contacts_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/sos_screen.dart';
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
    return MaterialApp(
      title: 'DEVI Women Safety',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      initialRoute: '/login',
      routes: {
        '/login': (context) => const LoginScreen(),
        '/profile': (context) => const ProfileScreen(),
        '/sos': (context) => const SosScreen(),
        '/settings': (context) => const SettingsScreen(),
        '/no-contacts': (context) => const NoContactsScreen(),
        '/history': (context) => const HistoryScreen(),
      },
    );
  }
}
