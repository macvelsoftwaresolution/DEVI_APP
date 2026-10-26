import 'dart:convert';

import 'package:devi/screens/login_screen.dart';
import 'package:devi/screens/onboarding/language_screen.dart';
import 'package:devi/screens/onboarding/onboarding_flow.dart';
import 'package:devi/screens/onboarding/quick_setup_screen.dart';
import 'package:devi/screens/onboarding/terms_screen.dart';
import 'package:devi/services/app_state.dart';
import 'package:devi/services/onboarding_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    // Native permission channel: answer "granted" so the terms step can continue
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('com.devi.app/sms'), (call) async => true);
  });

  testWidgets('first run: language → terms → quick setup → login', (tester) async {
    tester.view.physicalSize = const Size(1440, 3200);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);

    final first = await OnboardingFlow.firstScreen(isLoggedIn: false);
    expect(first, isA<LanguageScreen>());
    await tester.pumpWidget(MaterialApp(home: first));

    // Step 1: language
    expect(find.text('Choose your language'), findsOneWidget);
    expect(find.text('Coming soon'), findsNWidgets(2));
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    // Step 2: terms — button disabled until the box is ticked
    expect(find.byType(TermsScreen), findsOneWidget);
    await tester.tap(find.text('Agree & Continue'));
    await tester.pumpAndSettle();
    expect(find.byType(TermsScreen), findsOneWidget, reason: 'must not continue without agreeing');
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tester.tap(find.text('Agree & Continue'));
    await tester.pumpAndSettle();

    // Step 3: quick setup — validation, then save
    expect(find.byType(QuickSetupScreen), findsOneWidget);
    await tester.tap(find.text('Save & Continue'));
    await tester.pump();
    expect(find.text('Enter your name'), findsOneWidget);
    expect(find.text('Enter a 10-digit mobile number'), findsOneWidget);

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'Priya');
    await tester.enterText(fields.at(1), 'Amma');
    await tester.enterText(fields.at(2), '5876543210');
    await tester.tap(find.text('Save & Continue'));
    await tester.pump();
    expect(find.text('Number must start with 6, 7, 8 or 9'), findsOneWidget);

    await tester.enterText(fields.at(2), '9876543210');
    await tester.tap(find.text('Save & Continue'));
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);

    // Saved on the device
    expect(await OnboardingService.language(), 'en');
    expect(await OnboardingService.hasAcceptedCurrentTerms(), isTrue);
    expect(await OnboardingService.isSetupDone(), isTrue);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('devi_setup_name'), 'Priya');
    final guardians = jsonDecode(prefs.getString('devi_guest_guardians')!) as List;
    expect(guardians.single, {'name': 'Amma', 'phone': '9876543210'});
    expect(AppState.instance.setupGuardians.single.phone, '9876543210');

    // Next launch goes straight to login
    expect(await OnboardingFlow.firstScreen(isLoggedIn: false), isA<LoginScreen>());
  });

  testWidgets('"Already have an account?" opens sign in without Instant SOS', (tester) async {
    await OnboardingService.setLanguage('en');
    await OnboardingService.acceptTerms();
    expect(await OnboardingFlow.firstScreen(isLoggedIn: false), isA<QuickSetupScreen>());

    tester.view.physicalSize = const Size(1440, 3200);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const MaterialApp(home: QuickSetupScreen()));
    await tester.tap(find.text('Already have an account? Sign in'));
    await tester.pumpAndSettle();

    final login = tester.widget<LoginScreen>(find.byType(LoginScreen));
    expect(login.allowInstantSos, isFalse);
    expect(find.text('OR'), findsNothing);
    // Backing out without signing in keeps setup pending
    expect(await OnboardingService.isSetupDone(), isFalse);
  });

  test('logged-in users skip quick setup; a new terms version is asked again', () async {
    await OnboardingService.setLanguage('en');
    expect(await OnboardingFlow.firstScreen(isLoggedIn: true), isA<TermsScreen>());

    SharedPreferences.setMockInitialValues({'devi_language': 'en', 'devi_terms_version': 'v0-old'});
    expect(await OnboardingFlow.firstScreen(isLoggedIn: true), isA<TermsScreen>());
  });
}
