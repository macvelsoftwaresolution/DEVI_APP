import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Global, independent Map and Geolocation utility.
/// Can be reused across any Flutter screen or project without external project dependencies.
class MapUtils {
  MapUtils._();

  /// Generates a standard Google Maps URL from latitude and longitude.
  static String getGoogleMapsUrl(double latitude, double longitude) {
    return 'https://maps.google.com/?q=$latitude,$longitude';
  }

  /// Generates a Google Maps direction / navigation URL.
  static String getNavigationUrl({
    required double destinationLat,
    required double destinationLng,
    double? originLat,
    double? originLng,
  }) {
    if (originLat != null && originLng != null) {
      return 'https://www.google.com/maps/dir/?api=1&origin=$originLat,$originLng&destination=$destinationLat,$destinationLng&travelmode=driving';
    }
    return 'https://www.google.com/maps/dir/?api=1&destination=$destinationLat,$destinationLng&travelmode=driving';
  }

  /// Opens the coordinates in Google Maps or the platform's default map app.
  static Future<bool> openInGoogleMaps(double latitude, double longitude) async {
    final url = Uri.parse(getGoogleMapsUrl(latitude, longitude));
    try {
      if (await canLaunchUrl(url)) {
        return await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('⚠️ Error launching Google Maps: $e');
    }
    return false;
  }

  /// Launches native turn-by-turn GPS navigation towards the destination coordinates.
  static Future<bool> openNavigation({
    required double destinationLat,
    required double destinationLng,
    double? originLat,
    double? originLng,
  }) async {
    final urlStr = getNavigationUrl(
      destinationLat: destinationLat,
      destinationLng: destinationLng,
      originLat: originLat,
      originLng: originLng,
    );
    final url = Uri.parse(urlStr);
    try {
      if (await canLaunchUrl(url)) {
        return await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('⚠️ Error launching Navigation: $e');
    }
    return false;
  }

  /// Calculates the straight-line distance in meters between two GPS coordinates
  /// using the Haversine formula (completely independent pure math).
  static double calculateDistanceInMeters(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const double earthRadiusMeters = 6371000; // Earth radius in meters
    final dLat = _degreesToRadians(lat2 - lat1);
    final dLon = _degreesToRadians(lon2 - lon1);

    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_degreesToRadians(lat1)) *
            math.cos(_degreesToRadians(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);

    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadiusMeters * c;
  }

  /// Formats distance into human readable string (e.g., "350 m" or "2.4 km").
  static String formatDistance(double meters) {
    if (meters < 1000) {
      return '${meters.toStringAsFixed(0)} m';
    }
    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  static double _degreesToRadians(double degrees) {
    return degrees * math.pi / 180;
  }
}
