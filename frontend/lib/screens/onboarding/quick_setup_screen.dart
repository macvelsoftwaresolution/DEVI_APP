import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../services/app_state.dart';
import '../../services/onboarding_service.dart';
import '../../theme/app_colors.dart';
import '../../widgets/devi_button.dart';
import '../../widgets/input_field.dart';
import '../login_screen.dart';
import 'onboarding_flow.dart';

/// Name + one guardian, asked once before the login screen, so every SOS
/// (Instant SOS included) reaches a real person instead of only the control room.
class QuickSetupScreen extends StatefulWidget {
  const QuickSetupScreen({super.key});

  @override
  State<QuickSetupScreen> createState() => _QuickSetupScreenState();
}

class _QuickSetupScreenState extends State<QuickSetupScreen> {
  final _nameController = TextEditingController();
  final _guardianNameController = TextEditingController();
  final _guardianPhoneController = TextEditingController();

  String? _nameError;
  String? _guardianNameError;
  String? _guardianPhoneError;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Pre-fill if the user already started setup (e.g. came back from Sign in)
    final state = AppState.instance;
    _nameController.text = state.setupName;
    if (state.setupGuardians.isNotEmpty) {
      _guardianNameController.text = state.setupGuardians.first.name;
      _guardianPhoneController.text = state.setupGuardians.first.phone;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _guardianNameController.dispose();
    _guardianPhoneController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final guardianName = _guardianNameController.text.trim();
    final guardianPhone = _guardianPhoneController.text.trim();

    setState(() {
      _nameError = name.length < 2 ? 'Enter your name' : null;
      _guardianNameError = guardianName.length < 2 ? 'Enter your guardian\'s name' : null;
      _guardianPhoneError = guardianPhone.length != 10
          ? 'Enter a 10-digit mobile number'
          : !RegExp(r'^[6-9]\d{9}$').hasMatch(guardianPhone)
              ? 'Number must start with 6, 7, 8 or 9'
              : null;
    });
    if (_nameError != null || _guardianNameError != null || _guardianPhoneError != null) return;

    setState(() => _saving = true);
    await AppState.instance.saveQuickSetup(
      name: name,
      guardian: GuardianModel(name: guardianName, phone: guardianPhone),
    );
    await OnboardingService.markSetupDone();
    if (!mounted) return;
    OnboardingFlow.replaceWith(context, const LoginScreen());
  }

  void _signInInstead() {
    // Setup is marked done only after a successful sign in, so backing out returns here
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const LoginScreen(allowInstantSos: false)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return OnboardingScaffold(
      step: 'STEP 3 OF 3',
      title: 'Who should we alert?',
      subtitle: 'When you press SOS, this person gets a WhatsApp message with your live location.',
      bottom: Column(
        children: [
          DeviPrimaryButton(
            text: 'Save & Continue',
            onPressed: _saving ? null : _save,
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _saving ? null : _signInInstead,
            child: const Text(
              'Already have an account? Sign in',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.primaryNavy),
            ),
          ),
        ],
      ),
      child: ListView(
        children: [
          CustomTextField(
            label: 'Your name',
            hintText: 'e.g. Priya',
            controller: _nameController,
            prefixIcon: Icons.person_outline_rounded,
            textCapitalization: TextCapitalization.words,
            errorText: _nameError,
            onChanged: (_) {
              if (_nameError != null) setState(() => _nameError = null);
            },
          ),
          const SizedBox(height: 18),
          CustomTextField(
            label: 'Guardian name',
            hintText: 'e.g. Amma',
            controller: _guardianNameController,
            prefixIcon: Icons.shield_outlined,
            textCapitalization: TextCapitalization.words,
            errorText: _guardianNameError,
            onChanged: (_) {
              if (_guardianNameError != null) setState(() => _guardianNameError = null);
            },
          ),
          const SizedBox(height: 18),
          CustomTextField(
            label: 'Guardian mobile number',
            hintText: '98765 43210',
            controller: _guardianPhoneController,
            // India only for now; a country picker replaces this prefix later
            prefixText: '🇮🇳 +91  ',
            keyboardType: TextInputType.phone,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            errorText: _guardianPhoneError,
            onChanged: (_) {
              if (_guardianPhoneError != null) setState(() => _guardianPhoneError = null);
            },
          ),
          const SizedBox(height: 14),
          const Text(
            'Make sure they agree to be your emergency contact. You can add more guardians later in Settings.',
            style: TextStyle(fontSize: 13, height: 1.4, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}
