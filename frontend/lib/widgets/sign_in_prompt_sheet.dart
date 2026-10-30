import 'package:flutter/material.dart';
import '../config/features.dart';
import '../screens/login_screen.dart';
import '../services/onboarding_service.dart';
import '../theme/app_colors.dart';
import 'devi_button.dart';

/// Asks a guest to sign in once they are safe after an SOS. Never shown during an emergency.
/// "Later" asks once more on the next app open ([isReminder] false); the reminder itself
/// is the last ask (Settings keeps its Sign Up button).
Future<void> showSignInPromptSheet(BuildContext context, {bool isReminder = false}) async {
  final signIn = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.verified_user_rounded, color: Color(0xFF10B981), size: 36),
            const SizedBox(height: 12),
            Text(
              isReminder ? 'Save your SOS history' : 'Glad you are safe',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
            ),
            const SizedBox(height: 8),
            const Text(
              'Sign in to keep this alert${kEvidenceRecordingEnabled ? ' and its evidence' : ''} '
              'in your history, and to keep your guardians even if you change phones.',
              style: TextStyle(fontSize: 14, height: 1.45, color: AppColors.textMuted),
            ),
            const SizedBox(height: 20),
            DeviPrimaryButton(
              text: 'Sign in',
              onPressed: () => Navigator.of(ctx).pop(true),
            ),
            const SizedBox(height: 4),
            Center(
              child: TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text(
                  'Later',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textMuted),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  if (signIn == true) {
    if (!context.mounted) return;
    // Already a guest, so the sign in screen hides its own Instant SOS button
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const LoginScreen(allowInstantSos: false)),
    );
  } else if (!isReminder) {
    await OnboardingService.setSignInReminder();
  }
}
