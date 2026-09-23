import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../widgets/devi_logo.dart';
import 'login_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scaleAnimation;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;
  Timer? _navigationTimer;
  bool _hasNavigated = false;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );

    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeOutBack,
      ),
    );

    _fadeAnimation = Tween<double>(begin: 0.2, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeIn,
      ),
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.2),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeOutCubic,
      ),
    );

    _controller.forward();

    // Auto-navigate to login screen after 2.6 seconds
    _navigationTimer = Timer(const Duration(milliseconds: 2600), () {
      _goToLogin();
    });
  }

  void _goToLogin() {
    if (_hasNavigated || !mounted) return;
    _hasNavigated = true;
    _navigationTimer?.cancel();

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 500),
        pageBuilder: (context, animation, secondaryAnimation) =>
            const LoginScreen(),
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
    final isSmallScreen = size.width < 360;

    return Scaffold(
      body: GestureDetector(
        onTap: _goToLogin,
        child: Container(
          width: double.infinity,
          height: double.infinity,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFF0F172A), // Midnight Navy slate
                Color(0xFF1E1B4B), // Deep Indigo
                Color(0xFF0A0F1D), // Deep Dark Navy
              ],
            ),
          ),
          child: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24.0),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const Spacer(flex: 3),

                      // DEVI Logo with ambient red/coral glow
                      AnimatedBuilder(
                        animation: _controller,
                        builder: (context, child) {
                          return FadeTransition(
                            opacity: _fadeAnimation,
                            child: ScaleTransition(
                              scale: _scaleAnimation,
                              child: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  boxShadow: [
                                    BoxShadow(
                                      color: AppColors.emergencyRed
                                          .withValues(alpha: 0.35),
                                      blurRadius: 40,
                                      spreadRadius: 8,
                                    ),
                                  ],
                                ),
                                child: DeviLogoBadge(
                                  size: isSmallScreen ? 100 : 120,
                                  showShadow: true,
                                ),
                              ),
                            ),
                          );
                        },
                      ),

                      const SizedBox(height: 32),

                      // Animated "DEVI" Title
                      SlideTransition(
                        position: _slideAnimation,
                        child: FadeTransition(
                          opacity: _fadeAnimation,
                          child: const Column(
                            children: [
                              Text(
                                'DEVI',
                                style: TextStyle(
                                  fontSize: 40,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                  letterSpacing: 4.0,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(height: 12),

                      // "Your Guardian" Pill with Shield icon
                      SlideTransition(
                        position: _slideAnimation,
                        child: FadeTransition(
                          opacity: _fadeAnimation,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 20,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.emergencyRed.withValues(alpha: 0.16),
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(
                                color: AppColors.emergencyRed.withValues(alpha: 0.4),
                                width: 1.2,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.shield,
                                  size: 18,
                                  color: AppColors.emergencyRed,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Your Guardian',
                                  style: TextStyle(
                                    fontSize: isSmallScreen ? 15 : 17,
                                    fontWeight: FontWeight.w800,
                                    color: const Color(0xFFFF5252),
                                    letterSpacing: 0.6,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),

                      const Spacer(flex: 3),

                      // Bottom Tag & Loading indicator
                      FadeTransition(
                        opacity: _fadeAnimation,
                        child: const Column(
                          children: [
                            SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  AppColors.emergencyRed,
                                ),
                              ),
                            ),
                            SizedBox(height: 14),
                            Text(
                              'Women Safety & Emergency Assistance',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: Colors.white60,
                                letterSpacing: 0.4,
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 28),
                    ],
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
