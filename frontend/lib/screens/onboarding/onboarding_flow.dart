import 'package:flutter/material.dart';
import '../../services/app_state.dart';
import '../../services/onboarding_service.dart';
import '../login_screen.dart';
import '../sos_screen.dart';
import 'quick_setup_screen.dart';
import 'terms_screen.dart';

/// Decides which screen comes next on launch:
/// terms → (logged in ? SOS : quick setup → SOS as a guest). Sign in is offered later,
/// after the user is safe, so it never stands between them and Instant SOS.
class OnboardingFlow {
  OnboardingFlow._();

  static Future<Widget> firstScreen({required bool isLoggedIn}) async {
    if (!await OnboardingService.hasAcceptedCurrentTerms()) {
      return TermsScreen(isLoggedIn: isLoggedIn);
    }
    return afterTerms(isLoggedIn: isLoggedIn);
  }

  static Future<Widget> afterTerms({required bool isLoggedIn}) async {
    if (isLoggedIn) return const SosScreen();
    if (!await OnboardingService.isSetupDone()) return const QuickSetupScreen();
    // Guest session from an earlier launch (cleared on sign out, which shows sign in instead)
    if (AppState.instance.isGuest) return const SosScreen();
    return const LoginScreen();
  }

  static void replaceWith(BuildContext context, Widget screen) {
    Navigator.of(context).pushAndRemoveUntil(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 350),
        pageBuilder: (context, animation, secondaryAnimation) => screen,
        transitionsBuilder: (context, animation, secondaryAnimation, child) =>
            FadeTransition(opacity: animation, child: child),
      ),
      (route) => false,
    );
  }
}

/// Shared page frame for the onboarding screens
class OnboardingScaffold extends StatelessWidget {
  final String step;
  final String title;
  final String? subtitle;
  final Widget child;
  final Widget bottom;

  const OnboardingScaffold({
    super.key,
    required this.step,
    required this.title,
    this.subtitle,
    required this.child,
    required this.bottom,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FC),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: Color(0xFFE53E5B),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF1B1E34),
                      height: 1.2,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      subtitle!,
                      style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280), height: 1.4),
                    ),
                  ],
                  const SizedBox(height: 18),
                  Expanded(child: child),
                  const SizedBox(height: 12),
                  bottom,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
