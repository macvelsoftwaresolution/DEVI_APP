import 'package:flutter/material.dart';
import '../config/features.dart';
import '../theme/app_colors.dart';

/// Prominent disclosure shown right before the system permission prompts
/// (Google Play User Data policy). Returns true when the user taps Continue.
Future<bool> showPermissionDisclosureDialog(BuildContext context) async {
  final accepted = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      icon: const Icon(Icons.location_on_rounded, color: AppColors.emergencyRed, size: 32),
      title: const Text(
        kEvidenceRecordingEnabled ? 'Location, camera, microphone & contacts' : 'Location, calls & contacts',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
      ),
      content: const SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'When you press SOS:',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textDark, height: 1.4),
            ),
            SizedBox(height: 10),
            PermissionDisclosurePoints(),
            SizedBox(height: 6),
            Text(
              'Nothing is collected when SOS is not active.',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textDark, height: 1.4),
            ),
          ],
        ),
      ),
      actionsAlignment: MainAxisAlignment.spaceBetween,
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('Not now', style: TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w600)),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryNavy,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Continue', style: TextStyle(fontWeight: FontWeight.w800)),
        ),
      ],
    ),
  );
  return accepted ?? false;
}

/// What each permission is used for. Shared by the dialog and the inline card on the terms screen.
class PermissionDisclosurePoints extends StatelessWidget {
  const PermissionDisclosurePoints({super.key});

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Point(
          icon: Icons.my_location_rounded,
          text: 'Your location is sent to your guardians and the DEVI control room. Only once, no tracking.',
        ),
        if (kEvidenceRecordingEnabled)
          _Point(
            icon: Icons.videocam_rounded,
            text: 'Video and audio are recorded for up to 2 minutes as evidence, even if the app is in the background.',
          ),
        _Point(
          icon: Icons.call_rounded,
          text: 'Your first guardian gets a call from your phone.',
        ),
        _Point(
          icon: Icons.contacts_rounded,
          text: 'Contacts are read only to help you pick a guardian. They stay on your phone and are never uploaded.',
        ),
      ],
    );
  }
}

class _Point extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Point({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.primaryNavy),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 13, color: AppColors.textMuted, height: 1.4)),
          ),
        ],
      ),
    );
  }
}
