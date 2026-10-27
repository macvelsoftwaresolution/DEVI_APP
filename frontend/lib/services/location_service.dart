import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import '../utils/map_utils.dart';
import 'api_service.dart';
import 'emergency_foreground_service.dart';
import 'socket_service.dart';

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
  static StreamSubscription<Position>? _positionStreamSub;
  static String? _activeTrackingAlertId;
  static Timer? _heartbeatTimer;
  static Position? _lastTrackedPosition;

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

  /// Starts real-time continuous GPS tracking stream to push coordinates to backend.
  static void startLiveTracking({
    required String alertId,
    Function(double lat, double lng)? onUpdate,
  }) {
    // Cancel any existing active tracking session
    stopLiveTracking();

    _activeTrackingAlertId = alertId;
    debugPrint('🛰️ [LIVE TRACKING INITIATED] For Alert #$alertId');

    // Connect Low-Bandwidth WebSocket Channel
    SocketService.instance.connect();

    late LocationSettings locationSettings;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 2, // High-precision live tracking: updates every 2 meters
        forceLocationManager: false, // Google Play Services FusedLocationProviderClient for high accuracy (Wi-Fi + Cell + GPS)
        intervalDuration: const Duration(seconds: 2),
        // Background tracking needs a foreground service. When the SOS EmergencyService is running
        // it already covers location (one notification); otherwise use geolocator's own service.
        // Both notifications are worded discreetly so a bystander does not see an SOS is active.
        foregroundNotificationConfig: EmergencyForegroundService.isRunning
            ? null
            : const ForegroundNotificationConfig(
                notificationTitle: 'Location sharing on',
                notificationText: 'Tap to open',
                enableWakeLock: true,
                setOngoing: true,
              ),
      );
    } else if (!kIsWeb && (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS)) {
      locationSettings = AppleSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        activityType: ActivityType.fitness,
        distanceFilter: 2,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
      );
    } else {
      locationSettings = const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 2,
      );
    }

    try {
      _positionStreamSub = Geolocator.getPositionStream(
        locationSettings: locationSettings,
      ).listen((Position position) {
        // Discard low-accuracy / wild jitter readings (e.g. weak indoor satellite multipath)
        if (position.accuracy > 35.0) {
          debugPrint('⚠️ [GPS JITTER FILTER] Skipping low-accuracy reading: ±${position.accuracy.toStringAsFixed(1)}m');
          return;
        }

        debugPrint('📍 [LIVE GPS MOVED] Lat: ${position.latitude}, Lng: ${position.longitude}, Acc: ±${position.accuracy.toStringAsFixed(1)}m');
        
        onUpdate?.call(position.latitude, position.longitude);
        _lastTrackedPosition = position;
        _pushPosition(position);
      }, onError: (e) {
        debugPrint('⚠️ Error in Live Tracking stream: $e');
      });
    } catch (e) {
      debugPrint('⚠️ Failed to start live tracking stream: $e');
    }

    // Heartbeat: the stream only fires after 2m of movement, so a user standing still would
    // look "signal lost" on the dashboard. Re-send the latest position every 20s.
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 20), (_) async {
      final position = _lastTrackedPosition ?? await _safeLastKnownPosition();
      if (position != null) _pushPosition(position);
    });
  }

  static Future<Position?> _safeLastKnownPosition() async {
    if (kIsWeb) return null;
    try {
      return await Geolocator.getLastKnownPosition();
    } catch (_) {
      return null;
    }
  }

  // Push update to backend in real-time via low-bandwidth WebSocket stream
  static void _pushPosition(Position position) {
    if (_activeTrackingAlertId == null) return;
    SocketService.instance.sendLocationUpdate(
      alertId: _activeTrackingAlertId!,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      speed: position.speed,
      heading: position.heading,
      status: 'ACTIVE',
    );
  }

  /// Stops the real-time continuous GPS tracking stream.
  static Future<void> stopLiveTracking({bool resolveBackend = false}) async {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _lastTrackedPosition = null;
    if (_positionStreamSub != null) {
      debugPrint('🛑 [LIVE TRACKING STOPPED]');
      await _positionStreamSub?.cancel();
      _positionStreamSub = null;
    }

    // Disconnect WebSocket channel
    SocketService.instance.disconnect();

    if (resolveBackend && _activeTrackingAlertId != null) {
      await ApiService.instance.resolveEmergencyAlert(_activeTrackingAlertId!);
    }

    _activeTrackingAlertId = null;
  }

  /// Whether location can be used right now, and if not, why.
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

