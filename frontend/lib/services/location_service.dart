import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import '../utils/map_utils.dart';

/// Result of [LocationService.checkReadiness].
enum LocationReadiness { ready, serviceOff, permissionDenied, permissionBlocked }

class LocationResult {
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final DateTime? capturedAt;
  final String? mapsUrl;
  final String displayText;
  final bool isSuccess;

  const LocationResult({
    this.latitude,
    this.longitude,
    this.accuracy,
    this.capturedAt,
    this.mapsUrl,
    required this.displayText,
    required this.isSuccess,
  });
}

class LocationService {

  /// Checks permission and retrieves current GPS coordinates.
  /// Includes a strict timeout so SOS trigger is never blocked or delayed.
  static Future<LocationResult> getCurrentLocation({
    Duration timeout = const Duration(seconds: 4),
  }) async {
    try {
      // 1. Check if location services are enabled
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        debugPrint('⚠️ Location services are disabled.');
        // Try getting last known position if available
        final lastKnown = await Geolocator.getLastKnownPosition();
        if (lastKnown != null) {
          final url = MapUtils.getGoogleMapsUrl(lastKnown.latitude, lastKnown.longitude);
          return LocationResult(
            latitude: lastKnown.latitude,
            longitude: lastKnown.longitude,
            accuracy: lastKnown.accuracy,
            capturedAt: lastKnown.timestamp.toUtc(),
            mapsUrl: url,
            displayText: url,
            isSuccess: true,
          );
        }
        return const LocationResult(
          displayText: 'Location disabled on device',
          isSuccess: false,
        );
      }

      // 2. Check and request permission
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          debugPrint('⚠️ Location permission denied.');
          return const LocationResult(
            displayText: 'Location permission denied',
            isSuccess: false,
          );
        }
      }

      if (permission == LocationPermission.deniedForever) {
        debugPrint('⚠️ Location permissions are permanently denied.');
        return const LocationResult(
          displayText: 'Location permission permanently denied',
          isSuccess: false,
        );
      }

      // 3. Get accurate current position with fallback timeout
      Position? position;
      try {
        position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 4),
          ),
        );
      } catch (e) {
        debugPrint('Current position timed out or failed: $e, trying last known');
        position = await Geolocator.getLastKnownPosition();
      }

      if (position != null) {
        final lat = position.latitude;
        final lng = position.longitude;
        final accuracy = position.accuracy;
        final capturedAt = position.timestamp.toUtc();
        final mapsUrl = MapUtils.getGoogleMapsUrl(lat, lng);
        return LocationResult(
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
          capturedAt: capturedAt,
          mapsUrl: mapsUrl,
          displayText: mapsUrl,
          isSuccess: true,
        );
      }
    } catch (e) {
      debugPrint('Error getting location: $e');
    }

    return const LocationResult(
      displayText: '',
      isSuccess: false,
    );
  }

  static Future<LocationReadiness> checkReadiness() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return LocationReadiness.serviceOff;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) {
      return LocationReadiness.permissionBlocked;
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.unableToDetermine) {
      return LocationReadiness.permissionDenied;
    }
    return LocationReadiness.ready;
  }

  /// Checks if location permissions are currently granted.
  static Future<bool> hasPermission() async {
    final permission = await Geolocator.checkPermission();
    return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
  }
}

