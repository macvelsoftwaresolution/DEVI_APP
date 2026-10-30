import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../legal/terms_content.dart';

/// First-run steps: terms → quick setup (name + guardian) → Instant SOS as a guest.
/// Each step is stored on the device so it is shown only once.
class OnboardingService {
  OnboardingService._();

  static const String _keyTermsVersion = 'devi_terms_version';
  static const String _keyTermsAcceptedAt = 'devi_terms_accepted_at';
  static const String _keySetupDone = 'devi_quick_setup_done';
  static const String _keyDisclosureAccepted = 'devi_permission_disclosure_accepted';
  static const String _keySignInReminder = 'devi_sign_in_reminder';

  /// True only when the CURRENT terms version was accepted. A new version is shown again.
  static Future<bool> hasAcceptedCurrentTerms() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_keyTermsVersion) == TermsContent.version;
    } catch (e) {
      debugPrint('Onboarding: could not read terms state: $e');
      return false;
    }
  }

  static Future<void> acceptTerms() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyTermsVersion, TermsContent.version);
    await prefs.setString(_keyTermsAcceptedAt, DateTime.now().toUtc().toIso8601String());
  }

  /// True once the user tapped Continue on the location/camera/microphone disclosure
  static Future<bool> hasAcceptedPermissionDisclosure() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_keyDisclosureAccepted) ?? false;
    } catch (e) {
      debugPrint('Onboarding: could not read disclosure state: $e');
      return false;
    }
  }

  static Future<void> acceptPermissionDisclosure() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyDisclosureAccepted, true);
  }

  static Future<bool> isSetupDone() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_keySetupDone) ?? false;
    } catch (e) {
      debugPrint('Onboarding: could not read setup state: $e');
      return false;
    }
  }

  static Future<void> markSetupDone() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keySetupDone, true);
  }

  /// Guest tapped "Later" on the sign in prompt after an SOS: ask once more on the next app open
  static Future<void> setSignInReminder() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keySignInReminder, true);
  }

  /// True once after [setSignInReminder]; reading it clears it, so the reminder is never repeated
  static Future<bool> takeSignInReminder() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final pending = prefs.getBool(_keySignInReminder) ?? false;
      if (pending) await prefs.remove(_keySignInReminder);
      return pending;
    } catch (e) {
      debugPrint('Onboarding: could not read sign in reminder: $e');
      return false;
    }
  }

  static Future<void> clearSignInReminder() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keySignInReminder);
  }
}
