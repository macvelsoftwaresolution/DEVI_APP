import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../services/location_service.dart';
import '../theme/app_colors.dart';

/// Asks the user to turn location on (or allow it) so an SOS can share where they are.
Future<void> showLocationPromptDialog(BuildContext context, LocationReadiness readiness) {
  final isServiceOff = readiness == LocationReadiness.serviceOff;
  final isBlocked = readiness == LocationReadiness.permissionBlocked;

  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      icon: const Icon(Icons.location_off_rounded, color: AppColors.emergencyRed, size: 30),
      title: Text(
        isServiceOff ? 'Turn on location' : 'Allow location access',
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
      ),
      content: const Text(
        'DEVI needs your location to send help to the right place when you press SOS.',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 13.5, color: AppColors.textMuted, height: 1.4),
      ),
      actionsAlignment: MainAxisAlignment.center,
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('Later', style: TextStyle(color: AppColors.textMuted)),
        ),
        ElevatedButton(
          onPressed: () async {
            Navigator.of(ctx).pop();
            if (isServiceOff) {
              await Geolocator.openLocationSettings();
            } else if (isBlocked) {
              await Geolocator.openAppSettings();
            } else {
              await Geolocator.requestPermission();
            }
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryNavy,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: Text(isServiceOff ? 'Turn On' : 'Allow', style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
      ],
    ),
  );
}
