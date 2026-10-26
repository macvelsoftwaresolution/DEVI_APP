import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Card above the SOS button: "Demo Mode" (message preview) or the live alert status.
class SosGuideCard extends StatelessWidget {
  final bool isEmergencyActive;
  final bool isCountingDown;
  final String userName;

  const SosGuideCard({
    super.key,
    required this.isEmergencyActive,
    required this.isCountingDown,
    required this.userName,
  });

  @override
  Widget build(BuildContext context) {
    final String title;
    final String message;
    if (isEmergencyActive) {
      title = 'Alert is live';
      message = 'Tap the green card when safe';
    } else if (isCountingDown) {
      title = 'Sending alert…';
      message = 'Tap Cancel to stop';
    } else {
      title = 'Demo Mode';
      message = 'See the alert message';
    }

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        onTap: () => _showMessagePreview(context),
        borderRadius: BorderRadius.circular(24),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFFE2E8F0)),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4)),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(16)),
                child: const Icon(Icons.lightbulb_outline_rounded, color: Color(0xFFD97706), size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      message,
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textMuted,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.primaryNavy, size: 24),
            ],
          ),
        ),
      ),
    );
  }

  // Preview only: shows the alert message format, nothing is sent
  void _showMessagePreview(BuildContext context) {
    final name = userName.isNotEmpty ? userName : 'DEVI User';
    final time = TimeOfDay.now().format(context);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text(
          'Message preview',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('This is sent when you press SOS', style: TextStyle(fontSize: 12.5, color: AppColors.textMuted)),
            const SizedBox(height: 14),
            // WhatsApp-style message bubble
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
              decoration: const BoxDecoration(
                color: Color(0xFFDCF8C6),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(14),
                  bottomLeft: Radius.circular(14),
                  bottomRight: Radius.circular(14),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '🚨 EMERGENCY SOS ALERT',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF111B21)),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '$name needs help!',
                    style: const TextStyle(fontSize: 13, color: Color(0xFF111B21), height: 1.4),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    '📍 Live location: devi.app/track/…',
                    style: TextStyle(fontSize: 13, color: Color(0xFF027EB5), height: 1.4),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Call them now or dial 112.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF111B21), height: 1.4),
                  ),
                  Align(
                    alignment: Alignment.bottomRight,
                    child: Text(time, style: const TextStyle(fontSize: 10.5, color: Color(0xFF667781))),
                  ),
                ],
              ),
            ),
          ],
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text(
              'Got it',
              style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
            ),
          ),
        ],
      ),
    );
  }
}
