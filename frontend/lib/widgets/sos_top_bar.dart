import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'devi_logo.dart';

/// Home screen top bar: DEVI logo, history (with active-alert dot) and settings.
class SosTopBar extends StatelessWidget {
  final bool hasActiveAlert;
  final VoidCallback onHistoryTap;
  final VoidCallback onSettingsTap;

  const SosTopBar({super.key, required this.hasActiveAlert, required this.onHistoryTap, required this.onSettingsTap});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        const Flexible(
          child: DeviAppBarBadge(title: 'DEVI', subtitle: 'Your Safety Guardian', logoSize: 40, fontSize: 18),
        ),
        Row(
          children: [
            IconButton(
              tooltip: 'History',
              iconSize: 28,
              icon: Stack(
                clipBehavior: Clip.none,
                children: [
                  const Icon(Icons.history, color: AppColors.primaryNavy, size: 28),
                  if (hasActiveAlert)
                    Positioned(
                      top: -1,
                      right: -1,
                      child: Container(
                        width: 11,
                        height: 11,
                        decoration: BoxDecoration(
                          color: const Color(0xFF0284C7),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 1.5),
                        ),
                      ),
                    ),
                ],
              ),
              onPressed: onHistoryTap,
            ),
            IconButton(
              tooltip: 'Settings',
              iconSize: 28,
              icon: const Icon(Icons.settings_outlined, color: AppColors.primaryNavy, size: 28),
              onPressed: onSettingsTap,
            ),
          ],
        ),
      ],
    );
  }
}
