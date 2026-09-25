import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../theme/app_colors.dart';
import '../widgets/devi_button.dart';
import '../widgets/devi_logo.dart';
import '../widgets/emergency_permission_dialog.dart';
import 'profile_screen.dart';
import 'sos_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _phoneController = TextEditingController();
  bool _isLoading = false;
  String? _phoneError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      EmergencyPermissionDialog.showIfNeeded(context);
    });
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final phone = _phoneController.text.trim();
    
    // Strict mobile number validation
    if (phone.isEmpty) {
      setState(() => _phoneError = 'Please enter your mobile number');
      return;
    }
    if (phone.length != 10) {
      setState(() => _phoneError = 'Mobile number must be exactly 10 digits');
      return;
    }
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(phone)) {
      setState(() => _phoneError = 'Enter a valid number starting with 6, 7, 8, or 9');
      return;
    }

    setState(() {
      _phoneError = null;
      _isLoading = true;
    });

    try {
      // Dynamic login call to Node.js backend
      final res = await ApiService.instance.login(phone);
      if (!res['success']) {
        if (!mounted) return;
        final errorMsg = res['message'] ?? 'This mobile number is not registered. Please sign up first.';
        setState(() {
          _phoneError = errorMsg;
        });

        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppColors.emergencyRed,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            content: Row(
              children: [
                const Icon(Icons.error_outline, color: Colors.white, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    errorMsg,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
            duration: const Duration(seconds: 4),
          ),
        );
        return;
      }

      // Load user profile & guardians dynamically from backend
      await AppState.instance.loadUserProfile(phone);

      // Save session for auto-login persistence
      await AppState.instance.saveSession(phone);

      if (!mounted) return;
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          content: const Row(
            children: [
              Icon(Icons.check_circle_outline, color: Colors.white, size: 20),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Logged in successfully!',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          backgroundColor: AppColors.primaryNavy,
          duration: const Duration(seconds: 2),
        ),
      );

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const SosScreen()),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _phoneError = 'Connection error. Please check server.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _continueAsGuest() {
    AppState.instance.setGuestMode(true);
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (context) => const SosScreen()),
    );
  }

  void _navigateToSignUp() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => const ProfileScreen(isEditing: false),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    final isSmallScreen = size.width < 360;
    final isShortScreen = size.height < 650;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(
              horizontal: isSmallScreen ? 16.0 : 24.0,
              vertical: isShortScreen ? 12.0 : 20.0,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  SizedBox(height: isShortScreen ? 10 : size.height * 0.04),

                  // Devi Logo Badge
                  DeviLogoBadge(size: isSmallScreen || isShortScreen ? 64 : 78),
                  SizedBox(height: isShortScreen ? 12 : 18),

                  // "Your Guardian" Title
                  Text(
                    'Your Guardian',
                    style: TextStyle(
                      fontSize: isSmallScreen ? 22 : 26,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryNavy,
                      letterSpacing: -0.5,
                    ),
                  ),

                  SizedBox(height: isShortScreen ? 20 : 32),

                  // Form Container Card
                  Container(
                    width: double.infinity,
                    padding: EdgeInsets.all(isSmallScreen ? 16.0 : 22.0),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(isSmallScreen ? 20 : 26),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.04),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Mobile Number',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primaryNavy,
                            letterSpacing: -0.2,
                          ),
                        ),
                        const SizedBox(height: 10),

                        // Input field with grey background
                        Container(
                          height: 48,
                          decoration: BoxDecoration(
                            color: AppColors.inputFill,
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(
                              color: _phoneError != null
                                  ? AppColors.emergencyRed
                                  : Colors.transparent,
                              width: 1.4,
                            ),
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Row(
                            children: [
                              Icon(
                                Icons.phone_outlined,
                                size: 17,
                                color: _phoneError != null
                                    ? AppColors.emergencyRed
                                    : AppColors.textMuted,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '+91',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: _phoneError != null
                                      ? AppColors.emergencyRed
                                      : AppColors.primaryNavy,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextField(
                                  controller: _phoneController,
                                  keyboardType: TextInputType.phone,
                                  inputFormatters: [
                                    FilteringTextInputFormatter.digitsOnly,
                                    LengthLimitingTextInputFormatter(10),
                                  ],
                                  onChanged: (_) {
                                    if (_phoneError != null) {
                                      setState(() => _phoneError = null);
                                    }
                                  },
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.primaryNavy,
                                    letterSpacing: 0.5,
                                  ),
                                  decoration: const InputDecoration(
                                    border: InputBorder.none,
                                    isDense: true,
                                    contentPadding: EdgeInsets.zero,
                                    hintText: 'Enter mobile number',
                                    hintStyle: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w400,
                                      color: AppColors.textLight,
                                      letterSpacing: 0,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_phoneError != null) ...[
                          const SizedBox(height: 5),
                          Padding(
                            padding: const EdgeInsets.only(left: 14),
                            child: Text(
                              _phoneError!,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppColors.emergencyRed,
                              ),
                            ),
                          ),
                        ],

                        const SizedBox(height: 18),

                        // "Sign In ->" Button
                        DeviPrimaryButton(
                          text: _isLoading ? 'Signing In...' : 'Sign In',
                          height: 50,
                          trailing: _isLoading
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                  ),
                                )
                              : const Icon(
                                  Icons.arrow_forward,
                                  color: Colors.white,
                                  size: 17,
                                ),
                          onPressed: _isLoading ? null : _signIn,
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Guest User Pill Button
                  GuestUserButton(
                    onPressed: _continueAsGuest,
                  ),

                  const SizedBox(height: 32),

                  // "New User? Sign Up" Link
                  GestureDetector(
                    onTap: _navigateToSignUp,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Text(
                          'New User? ',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textMuted,
                          ),
                        ),
                        Text(
                          'Sign Up',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.emergencyRed,
                          ),
                        ),
                      ],
                    ),
                  ),

                  SizedBox(height: size.height * 0.04),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
