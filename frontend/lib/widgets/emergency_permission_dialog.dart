import 'package:flutter/material.dart';
import '../services/permission_service.dart';
import '../theme/app_colors.dart';

class EmergencyPermissionDialog extends StatefulWidget {
  final VoidCallback? onGranted;
  const EmergencyPermissionDialog({super.key, this.onGranted});

  static Future<void> showIfNeeded(BuildContext context) async {
    final alreadyConfigured = await PermissionService.hasSafetyPermissions();
    if (!alreadyConfigured && context.mounted) {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => const EmergencyPermissionDialog(),
      );
    }
  }

  @override
  State<EmergencyPermissionDialog> createState() =>
      _EmergencyPermissionDialogState();
}

class _EmergencyPermissionDialogState extends State<EmergencyPermissionDialog> {
  bool _isLoading = false;

  Future<void> _handleGrant() async {
    setState(() => _isLoading = true);
    try {
      await PermissionService.requestAllSafetyPermissions();
      if (mounted) {
        Navigator.of(context).pop();
        widget.onGranted?.call();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Row(
              children: [
                Icon(Icons.shield_rounded, color: Colors.white, size: 20),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '🛡️ Safety Protection Active! 2-Min Video & Audio recording enabled on SOS.',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                ),
              ],
            ),
            backgroundColor: const Color(0xFF0F172A),
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      backgroundColor: Colors.white,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Shield Icon with glow
            Center(
              child: Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.emergencyRed.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.shield_rounded,
                  color: AppColors.emergencyRed,
                  size: 40,
                ),
              ),
            ),
            const SizedBox(height: 18),

            const Text(
              'Enable Emergency Protection',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: AppColors.primaryNavy,
              ),
            ),
            const SizedBox(height: 8),

            const Text(
              'To protect you instantly during an emergency, DEVI needs upfront permission to record evidence and alert contacts.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: AppColors.textMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),

            // Feature 1: Video & Audio 2-min evidence
            _buildPermissionItem(
              icon: Icons.videocam_rounded,
              iconColor: const Color(0xFFE11D48),
              title: '2-Minute Video & Audio Evidence',
              subtitle: 'Records automatically upon pressing SOS.',
            ),
            const SizedBox(height: 12),

            // Feature 2: Realtime GPS
            _buildPermissionItem(
              icon: Icons.location_on_rounded,
              iconColor: const Color(0xFF2563EB),
              title: 'Live GPS Location',
              subtitle: 'Shares your exact emergency coordinates.',
            ),
            const SizedBox(height: 12),

            // Feature 3: SMS & Call
            _buildPermissionItem(
              icon: Icons.phone_forwarded_rounded,
              iconColor: const Color(0xFF059669),
              title: 'Silent SMS & Auto Call',
              subtitle: 'Alerts registered guardians and emergency 112.',
            ),
            const SizedBox(height: 24),

            // Allow Button
            ElevatedButton(
              onPressed: _isLoading ? null : _handleGrant,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.emergencyRed,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                elevation: 3,
              ),
              child: _isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Allow All & Activate Protection',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
            ),
            const SizedBox(height: 8),

            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(
                'Maybe Later',
                style: TextStyle(
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPermissionItem({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primaryNavy,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
