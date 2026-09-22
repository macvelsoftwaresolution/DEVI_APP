import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:devi/screens/history_screen.dart';
import 'package:devi/screens/login_screen.dart';
import 'package:devi/screens/profile_screen.dart';
import 'package:devi/screens/sos_screen.dart';
import 'package:devi/theme/app_theme.dart';

void main() {
  Widget createTestWidget(Widget child) {
    return MaterialApp(
      theme: AppTheme.lightTheme,
      home: MediaQuery(
        data: const MediaQueryData(
          size: Size(360, 800),
          padding: EdgeInsets.only(top: 24, bottom: 16),
        ),
        child: child,
      ),
    );
  }

  group('Devi Mobile Screen Layout Tests (360x800)', () {
    testWidgets('LoginScreen renders without errors', (WidgetTester tester) async {
      await tester.pumpWidget(createTestWidget(const LoginScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Your Guardian'), findsOneWidget);
      expect(find.text('Mobile Number'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);
      expect(find.text('Guest User'), findsOneWidget);
      expect(find.text('Sign Up'), findsOneWidget);
    });

    testWidgets('ProfileScreen renders without errors', (WidgetTester tester) async {
      await tester.pumpWidget(createTestWidget(const ProfileScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Create Your Profile'), findsOneWidget);
      expect(find.text('Full Legal Name'), findsOneWidget);
      expect(find.text('Mandatory'), findsOneWidget);
      expect(find.text('Optional'), findsOneWidget);
      expect(find.text('+ Add Guardian'), findsOneWidget);
      expect(find.text('Finish'), findsOneWidget);
    });

    testWidgets('SosScreen renders without errors', (WidgetTester tester) async {
      await tester.pumpWidget(createTestWidget(const SosScreen()));
      await tester.pump();

      expect(find.text('Sos'), findsOneWidget);
      expect(find.text('SOS'), findsOneWidget);
      expect(find.text('Emergency Sound'), findsOneWidget);
      expect(find.text('Demo'), findsOneWidget);
    });

    testWidgets('HistoryScreen renders without errors', (WidgetTester tester) async {
      await tester.pumpWidget(createTestWidget(const HistoryScreen()));
      await tester.pumpAndSettle();

      expect(find.text('History'), findsOneWidget);
      expect(find.text('Today, 10:42 PM'), findsOneWidget);
      expect(find.text('12 Sep 2026, 11:30 PM'), findsOneWidget);
    });
  });
}
