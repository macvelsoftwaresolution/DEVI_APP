import 'package:flutter/material.dart';

import '../services/sms_service.dart';
import '../theme/app_colors.dart';

/// What SOS does and does not do, on the SOS screen itself: DEVI alerts the guardians, no one
/// at DEVI watches alerts, and in danger the user should call the emergency number too.
/// The button calls it from the phone (the SIM, no internet needed).
class EmergencyNumberNote extends StatelessWidget {
  const EmergencyNumberNote({super.key, this.compact = false});

  // India's emergency number. 112 also works in the EU and many other countries.
  static const String emergencyNumber = '112';

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: compact ? 6 : 8),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFED7AA)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded, size: 18, color: Color(0xFFC2410C)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'SOS alerts your guardians. No one at DEVI watches alerts. In danger, also call $emergencyNumber.',
              style: TextStyle(
                fontSize: compact ? 10.5 : 11.5,
                height: 1.3,
                fontWeight: FontWeight.w600,
                color: AppColors.primaryNavy,
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            height: 32,
            child: ElevatedButton.icon(
              onPressed: () => SmsService.makePhoneCall(emergencyNumber),
              icon: const Icon(Icons.call_rounded, size: 16),
              label: const Text('Call $emergencyNumber', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
