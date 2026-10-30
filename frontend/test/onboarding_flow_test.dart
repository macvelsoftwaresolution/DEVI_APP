import 'dart:convert';

import 'package:devi/screens/login_screen.dart';
import 'package:devi/screens/onboarding/onboarding_flow.dart';
import 'package:devi/screens/onboarding/quick_setup_screen.dart';
import 'package:devi/screens/onboarding/terms_screen.dart';
import 'package:devi/screens/sos_screen.dart';
import 'package:devi/services/app_state.dart';
import 'package:devi/services/onboarding_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    // Native permission channel: answer "granted" so the terms step can continue
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('com.devi.app/sms'), (call) async => true);
  });

  testWidgets('first run: terms → quick setup → SOS as a guest', (tester) async {
    tester.view.physicalSize = const Size(1440, 3200);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);

    final first = await OnboardingFlow.firstScreen(isLoggedIn: false);
    expect(first, isA<TermsScreen>());
    await tester.pumpWidget(MaterialApp(home: first));

    // Step 1: terms — one tap; the button itself is the agreement
    expect(find.byType(TermsScreen), findsOneWidget);
    expect(find.byType(Checkbox), findsNothing);
    expect(find.textContaining('By tapping Agree & Continue'), findsOneWidget);
    await tester.tap(find.text('Agree & Continue'));
    await tester.pumpAndSettle();

    // Prominent disclosure appears before any system permission prompt
    expect(find.text('Location, calls & contacts'), findsOneWidget);
    expect(find.textContaining('never uploaded'), findsOneWidget);
    expect(find.textContaining('Only once, no tracking'), findsOneWidget);
    // Evidence recording is off until Phase 2: no camera / microphone line
    expect(find.textContaining('Video and audio'), findsNothing);
    expect(await OnboardingService.hasAcceptedPermissionDisclosure(), isFalse);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(await OnboardingService.hasAcceptedPermissionDisclosure(), isTrue);

    // Step 2: quick setup — validation, then save
    expect(find.byType(QuickSetupScreen), findsOneWidget);
    await tester.tap(find.text('Save & Continue'));
    await tester.pump();
    expect(find.text('Enter your name'), findsOneWidget);
    expect(find.text('Enter a 10-digit mobile number'), findsOneWidget);

    // Order: your name → guardian mobile → guardian name (filled from contacts)
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'Priya');
    await tester.enterText(fields.at(1), '5876543210');
    await tester.enterText(fields.at(2), 'Amma');
    await tester.tap(find.text('Save & Continue'));
    await tester.pump();
    expect(find.text('Number must start with 6, 7, 8 or 9'), findsOneWidget);

    await tester.enterText(fields.at(1), '9876543210');
    await tester.tap(find.text('Save & Continue'));
    // The SOS screen animates forever, so pump frames instead of settling
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(SosScreen), findsOneWidget);
    expect(AppState.instance.isGuest, isTrue);

    // Saved on the device
    expect(await OnboardingService.hasAcceptedCurrentTerms(), isTrue);
    expect(await OnboardingService.isSetupDone(), isTrue);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('devi_setup_name'), 'Priya');
    final guardians = jsonDecode(prefs.getString('devi_guest_guardians')!) as List;
    expect(guardians.single, {'name': 'Amma', 'phone': '9876543210'});
    expect(AppState.instance.setupGuardians.single.phone, '9876543210');

    // Next launch goes straight to the SOS screen as a guest
    expect(await OnboardingFlow.firstScreen(isLoggedIn: false), isA<SosScreen>());

    // After sign out the guest session is gone: sign in is shown instead
    await AppState.instance.clearSession();
    await AppState.instance.checkAutoLogin();
    expect(await OnboardingFlow.firstScreen(isLoggedIn: false), isA<LoginScreen>());
  });

  testWidgets('"Already have an account?" opens sign in without Instant SOS', (tester) async {
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

  testWidgets('"Not now" on the disclosure skips permission prompts', (tester) async {
    var permissionCalls = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('com.devi.app/sms'), (call) async {
      permissionCalls++;
      return true;
    });
    tester.view.physicalSize = const Size(1440, 3200);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(const MaterialApp(home: TermsScreen(isLoggedIn: false)));
    await tester.tap(find.text('Agree & Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Not now'));
    await tester.pumpAndSettle();

    expect(permissionCalls, 0, reason: 'no system prompt without accepting the disclosure');
    expect(await OnboardingService.hasAcceptedPermissionDisclosure(), isFalse);
    expect(find.byType(QuickSetupScreen), findsOneWidget);
  });

  test('logged-in users skip quick setup; a new terms version is asked again', () async {
    expect(await OnboardingFlow.firstScreen(isLoggedIn: true), isA<TermsScreen>());

    SharedPreferences.setMockInitialValues({'devi_terms_version': 'v0-old'});
    expect(await OnboardingFlow.firstScreen(isLoggedIn: true), isA<TermsScreen>());
  });

  test('sign in reminder after "Later" is asked only once', () async {
    expect(await OnboardingService.takeSignInReminder(), isFalse);
    await OnboardingService.setSignInReminder();
    expect(await OnboardingService.takeSignInReminder(), isTrue);
    expect(await OnboardingService.takeSignInReminder(), isFalse);
  });
}
