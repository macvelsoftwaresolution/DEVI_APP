import 'package:flutter/material.dart';
import '../../config/features.dart';
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
  bool _saving = false;

  Future<void> _accept() async {
    setState(() => _saving = true);
    await OnboardingService.acceptTerms();

    // Prominent disclosure (Google Play User Data policy): shown as its own card on this page,
    // so the system prompts follow this tap directly. A denied permission is asked again
    // where it is needed (the SOS screen asks for location).
    // showPermissionDisclosureDialog is kept for when a separate dialog is wanted again.
    await OnboardingService.acceptPermissionDisclosure();
    try {
      await PermissionService.requestAllSafetyPermissions();
    } catch (e) {
      debugPrint('Error requesting safety permissions after terms: $e');
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
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 2),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.borderCard),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  kEvidenceRecordingEnabled
                      ? 'Location, camera, microphone & contacts'
                      : 'Location, calls & contacts',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
                ),
                SizedBox(height: 2),
                Text(
                  'Used only when you press SOS. Nothing is collected otherwise.',
                  style: TextStyle(fontSize: 12, height: 1.4, color: AppColors.textMuted),
                ),
                SizedBox(height: 10),
                PermissionDisclosurePoints(),
              ],
            ),
          ),
          const SizedBox(height: 4),
          // Tapping the button is the agreement (one tap instead of a checkbox + button)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 6),
            child: Text(
              'By tapping Agree & Continue, you accept the Terms of Use and Privacy notice above '
              'and allow these permissions.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, height: 1.4, color: AppColors.textMuted),
            ),
          ),
          const SizedBox(height: 8),
          DeviPrimaryButton(
            text: 'Agree & Continue',
            onPressed: _saving ? null : _accept,
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
