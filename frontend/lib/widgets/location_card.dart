import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../utils/map_utils.dart';

/// Independent, reusable Location Status & Map Action Card.
/// Can be placed on SOS screen, Guest screen, or Responder Duty screen.
class LocationCard extends StatelessWidget {
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final String? addressOrStatus;
  final VoidCallback? onRefresh;
  final bool isTracking;

  const LocationCard({
    super.key,
    this.latitude,
    this.longitude,
    this.accuracy,
    this.addressOrStatus,
    this.onRefresh,
    this.isTracking = false,
  });

  @override
  Widget build(BuildContext context) {
    final hasCoords = latitude != null && longitude != null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isTracking ? const Color(0xFFFECDD3) : AppColors.borderCard,
          width: isTracking ? 1.4 : 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: isTracking
                ? const Color(0xFFE11D48).withValues(alpha: 0.08)
                : Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          // Map / Location pin badge
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: isTracking
                  ? const Color(0xFFFFF1F2)
                  : const Color(0xFFF1F5F9),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isTracking ? Icons.my_location : Icons.location_on_outlined,
              color: isTracking ? const Color(0xFFE11D48) : AppColors.primaryNavy,
              size: 22,
            ),
          ),
          const SizedBox(width: 14),
          // Location text / status
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      isTracking ? 'Live GPS Streaming' : 'Current Location',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primaryNavy,
                      ),
                    ),
                    if (isTracking) ...[
                      const SizedBox(width: 6),
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: Color(0xFFE11D48),
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  hasCoords
                      ? '${latitude!.toStringAsFixed(4)}, ${longitude!.toStringAsFixed(4)}${accuracy != null ? " (±${accuracy!.toStringAsFixed(0)}m)" : ""}'
                      : (addressOrStatus ?? 'Acquiring GPS fix...'),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textMuted,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          // Action: Open in Google Maps
          if (hasCoords)
            IconButton(
              icon: const Icon(
                Icons.map_outlined,
                color: Color(0xFF0284C7),
                size: 22,
              ),
              tooltip: 'Open in Google Maps',
              onPressed: () => MapUtils.openInGoogleMaps(latitude!, longitude!),
            )
          else if (onRefresh != null)
            IconButton(
              icon: const Icon(
                Icons.refresh_rounded,
                color: AppColors.textMuted,
                size: 20,
              ),
              tooltip: 'Refresh GPS',
              onPressed: onRefresh,
            ),
        ],
      ),
    );
  }
}
