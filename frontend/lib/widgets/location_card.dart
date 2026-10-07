import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../theme/app_colors.dart';
import '../utils/map_utils.dart';

/// Independent, reusable Location Status & Map Action Card.
/// Can be placed on SOS screen, Guest screen, or Responder Duty screen.
class LocationCard extends StatefulWidget {
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
  State<LocationCard> createState() => _LocationCardState();
}

class _LocationCardState extends State<LocationCard> {
  GoogleMapController? mapController;

  @override
  Widget build(BuildContext context) {
    final hasCoords = widget.latitude != null && widget.longitude != null;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: widget.isTracking ? const Color(0xFFFECDD3) : AppColors.borderCard,
          width: widget.isTracking ? 1.4 : 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: widget.isTracking
                ? const Color(0xFFE11D48).withValues(alpha: 0.08)
                : Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
            child: Row(
              children: [
                // Map / Location pin badge
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: widget.isTracking
                        ? const Color(0xFFFFF1F2)
                        : const Color(0xFFF1F5F9),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    widget.isTracking ? Icons.my_location : Icons.location_on_outlined,
                    color: widget.isTracking ? const Color(0xFFE11D48) : AppColors.primaryNavy,
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
                            widget.isTracking ? 'Live GPS Streaming' : 'Current Location',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryNavy,
                            ),
                          ),
                          if (widget.isTracking) ...[
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
                            ? '${widget.latitude!.toStringAsFixed(4)}, ${widget.longitude!.toStringAsFixed(4)}${widget.accuracy != null ? " (±${widget.accuracy!.toStringAsFixed(0)}m)" : ""}'
                            : (widget.addressOrStatus ?? 'Acquiring GPS fix...'),
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
                      Icons.open_in_new_rounded,
                      color: Color(0xFF0284C7),
                      size: 22,
                    ),
                    tooltip: 'Open in App',
                    onPressed: () => MapUtils.openInGoogleMaps(widget.latitude!, widget.longitude!),
                  )
                else if (widget.onRefresh != null)
                  IconButton(
                    icon: const Icon(
                      Icons.refresh_rounded,
                      color: AppColors.textMuted,
                      size: 20,
                    ),
                    tooltip: 'Refresh GPS',
                    onPressed: widget.onRefresh,
                  ),
              ],
            ),
          ),
          
          // Google Map Embedded Widget
          if (hasCoords)
            ClipRRect(
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(20),
                bottomRight: Radius.circular(20),
              ),
              child: SizedBox(
                height: 180, // Height of the embedded map
                width: double.infinity,
                child: GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: LatLng(widget.latitude!, widget.longitude!),
                    zoom: 15,
                  ),
                  onMapCreated: (GoogleMapController controller) {
                    mapController = controller;
                  },
                  markers: {
                    Marker(
                      markerId: const MarkerId('current_loc'),
                      position: LatLng(widget.latitude!, widget.longitude!),
                      icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
                    )
                  },
                  // Example Prototype for your Polygon/Zone drawing!
                  polygons: {
                    Polygon(
                      polygonId: const PolygonId('danger_zone_1'),
                      points: [
                        LatLng(widget.latitude! + 0.005, widget.longitude! - 0.005),
                        LatLng(widget.latitude! + 0.005, widget.longitude! + 0.005),
                        LatLng(widget.latitude! - 0.005, widget.longitude! + 0.005),
                        LatLng(widget.latitude! - 0.005, widget.longitude! - 0.005),
                      ],
                      strokeWidth: 2,
                      strokeColor: Colors.red,
                      fillColor: Colors.red.withOpacity(0.2), // Semi-transparent red zone
                    )
                  },
                  myLocationEnabled: false,
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
