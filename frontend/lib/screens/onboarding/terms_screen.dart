import 'package:flutter/material.dart';
import '../../legal/terms_content.dart';
import '../../services/onboarding_service.dart';
import '../../services/permission_service.dart';
import '../../theme/app_colors.dart';
import '../../widgets/devi_button.dart';
import '../../widgets/permission_disclosure_dialog.dart';
import 'onboarding_flow.dart';

class TermsScreen extends StatefulWidget {
  final bool isLoggedIn;
  const TermsScreen({super.key, required this.isLoggedIn});

  @override
  State<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends State<TermsScreen> {
  bool _agreed = false;
  bool _saving = false;

  Future<void> _accept() async {
    setState(() => _saving = true);
    await OnboardingService.acceptTerms();

    // Prominent disclosure (Google Play User Data policy): a separate dialog immediately
    // before the system prompts. "Not now" skips them; the SOS screen asks for location later.
    if (!mounted) return;
    final allowed = await showPermissionDisclosureDialog(context);
    if (allowed) {
      await OnboardingService.acceptPermissionDisclosure();
      try {
        await PermissionService.requestAllSafetyPermissions();
      } catch (e) {
        debugPrint('Error requesting safety permissions after terms: $e');
      }
    }

    final next = await OnboardingFlow.afterTerms(isLoggedIn: widget.isLoggedIn);
    if (!mounted) return;
    OnboardingFlow.replaceWith(context, next);
  }

  @override
  Widget build(BuildContext context) {
    return OnboardingScaffold(
      step: widget.isLoggedIn ? 'UPDATED TERMS' : 'STEP 1 OF 2',
      title: 'Terms & Privacy',
      subtitle: 'Please read how DEVI keeps you safe and what it shares in an emergency.',
      bottom: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => setState(() => _agreed = !_agreed),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Checkbox(
                    value: _agreed,
                    activeColor: AppColors.primaryNavy,
                    onChanged: (v) => setState(() => _agreed = v ?? false),
                  ),
                  const Expanded(
                    child: Text(
                      'I have read and agree to the Terms of Use and Privacy notice',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textDark),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          DeviPrimaryButton(
            text: 'Agree & Continue',
            onPressed: _agreed && !_saving ? _accept : null,
          ),
        ],
      ),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderCard),
        ),
        child: Scrollbar(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              for (final section in TermsContent.sections) ...[
                Text(
                  section.title,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.textDark),
                ),
                const SizedBox(height: 6),
                Text(
                  section.body,
                  style: const TextStyle(fontSize: 14, height: 1.5, color: Color(0xFF374151)),
                ),
                const SizedBox(height: 16),
              ],
              Text(
                '${TermsContent.company} · Last updated ${TermsContent.lastUpdated}'
                '${TermsContent.contactEmail.isNotEmpty ? ' · ${TermsContent.contactEmail}' : ''}',
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
