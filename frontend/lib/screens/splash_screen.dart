import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/app_state.dart';
import '../services/onboarding_service.dart';
import '../services/permission_service.dart';
import 'onboarding/onboarding_flow.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fadeAnimation;
  late final Animation<double> _scaleAnimation;

  Timer? _navigationTimer;
  bool _hasNavigated = false;
  late final Future<Widget> _nextScreen;

  @override
  void initState() {
    super.initState();

    // Restore session and decide the next screen (onboarding or app) while the logo shows
    _nextScreen = _initAppFlow();

    // Fast and smooth fade-in
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    _scaleAnimation = Tween<double>(begin: 0.94, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
    );

    _controller.forward();

    // Smooth navigation after 2.0 seconds
    _navigationTimer = Timer(const Duration(milliseconds: 2000), () {
      _navigateToNext();
    });
  }

  Future<Widget> _initAppFlow() async {
    var loggedIn = false;
    try {
      loggedIn = await AppState.instance.checkAutoLogin();
    } catch (_) {}

    // Permissions are asked only after the terms screen has explained why they are needed.
    // First-run users get the request from the terms screen instead.
    if (await OnboardingService.hasAcceptedCurrentTerms() &&
        await OnboardingService.hasAcceptedPermissionDisclosure()) {
      try {
        await PermissionService.requestAllSafetyPermissions();
      } catch (e) {
        debugPrint('Error requesting initial safety permissions: $e');
      }
    }

    return OnboardingFlow.firstScreen(isLoggedIn: loggedIn);
  }

  Future<void> _navigateToNext() async {
    if (_hasNavigated || !mounted) return;
    _hasNavigated = true;
    _navigationTimer?.cancel();

    final Widget targetScreen = await _nextScreen;
    if (!mounted) return;

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 500),
        pageBuilder: (context, animation, secondaryAnimation) => targetScreen,
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(opacity: animation, child: child);
        },
      ),
    );
  }

  @override
  void dispose() {
    _navigationTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isShortScreen = size.height < 680;
    final isVeryShort = size.height < 580;

    // Responsive dimensions for the framed image
    final double cardWidth = (size.width * 0.78).clamp(260.0, 340.0);
    final double cardHeight = isVeryShort
        ? 240.0
        : isShortScreen
            ? 320.0
            : (size.height * 0.50).clamp(320.0, 440.0);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        systemNavigationBarColor: Color(0xFFFAF6EE),
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: const Color(0xFFFAF6EE),
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _navigateToNext,
          child: Container(
            width: double.infinity,
            height: double.infinity,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFFFCF9F2),
                  Color(0xFFFAF6EE),
                  Color(0xFFF6F0E4),
                ],
              ),
            ),
            child: SafeArea(
              child: Center(
                child: FadeTransition(
                  opacity: _fadeAnimation,
                  child: ScaleTransition(
                    scale: _scaleAnimation,
                    child: Container(
                      width: cardWidth,
                      height: cardHeight,
                      decoration: BoxDecoration(
                        color: const Color(0xFF070B14),
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(
                          color: const Color(0xFFDFD1B3),
                          width: 1.5,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFFC9A048)
                                .withValues(alpha: 0.24),
                            blurRadius: 36,
                            spreadRadius: 4,
                            offset: const Offset(0, 12),
                          ),
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.08),
                            blurRadius: 16,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(22.5),
                        child: Image.asset(
                          'assets/images/devi-logo.png',
                          width: cardWidth,
                          height: cardHeight,
                          fit: BoxFit.contain,
                          errorBuilder: (context, error, stackTrace) =>
                              const Center(
                            child: Icon(
                              Icons.shield_rounded,
                              size: 72,
                              color: Color(0xFFD4AF37),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
