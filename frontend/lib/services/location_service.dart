import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'api_service.dart';

class LocationResult {
  final double? latitude;
  final double? longitude;
  final String? mapsUrl;
  final String displayText;
  final bool isSuccess;

  const LocationResult({
    this.latitude,
    this.longitude,
    this.mapsUrl,
    required this.displayText,
    required this.isSuccess,
  });
}

class LocationService {
  static StreamSubscription<Position>? _positionStreamSub;
  static String? _activeTrackingAlertId;

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
          final url = 'https://maps.google.com/?q=${lastKnown.latitude},${lastKnown.longitude}';
          return LocationResult(
            latitude: lastKnown.latitude,
            longitude: lastKnown.longitude,
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
        final mapsUrl = 'https://maps.google.com/?q=$lat,$lng';
        return LocationResult(
          latitude: lat,
          longitude: lng,
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

  /// Starts real-time continuous GPS tracking stream to push coordinates to backend.
  static void startLiveTracking({
    required String alertId,
    Function(double lat, double lng)? onUpdate,
  }) {
    // Cancel any existing active tracking session
    stopLiveTracking();

    _activeTrackingAlertId = alertId;
    debugPrint('🛰️ [LIVE TRACKING INITIATED] For Alert #$alertId');

    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 5, // Stream updates every 5 meters moved
    );

    try {
      _positionStreamSub = Geolocator.getPositionStream(
        locationSettings: locationSettings,
      ).listen((Position position) {
        debugPrint('📍 [LIVE GPS MOVED] Lat: ${position.latitude}, Lng: ${position.longitude}');
        
        onUpdate?.call(position.latitude, position.longitude);

        // Push update to backend in real-time
        if (_activeTrackingAlertId != null) {
          ApiService.instance.updateLiveLocation(
            alertId: _activeTrackingAlertId!,
            latitude: position.latitude,
            longitude: position.longitude,
            status: 'ACTIVE',
          );
        }
      }, onError: (e) {
        debugPrint('⚠️ Error in Live Tracking stream: $e');
      });
    } catch (e) {
      debugPrint('⚠️ Failed to start live tracking stream: $e');
    }
  }

  /// Stops the real-time continuous GPS tracking stream.
  static Future<void> stopLiveTracking({bool resolveBackend = false}) async {
    if (_positionStreamSub != null) {
      debugPrint('🛑 [LIVE TRACKING STOPPED]');
      await _positionStreamSub?.cancel();
      _positionStreamSub = null;
    }

    if (resolveBackend && _activeTrackingAlertId != null) {
      await ApiService.instance.resolveEmergencyAlert(_activeTrackingAlertId!);
    }

    _activeTrackingAlertId = null;
  }
}
