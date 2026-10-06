import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import '../utils/map_utils.dart';
import 'api_service.dart';
import 'socket_service.dart';

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
        forceLocationManager: true,
        intervalDuration: const Duration(seconds: 2),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: "🚨 DEVI Emergency SOS Active",
          notificationText: "Live GPS is continuously streaming to your emergency guardians.",
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
        debugPrint('📍 [LIVE GPS MOVED] Lat: ${position.latitude}, Lng: ${position.longitude}');
        
        onUpdate?.call(position.latitude, position.longitude);

        // Push update to backend in real-time via low-bandwidth WebSocket stream
        if (_activeTrackingAlertId != null) {
          SocketService.instance.sendLocationUpdate(
            alertId: _activeTrackingAlertId!,
            latitude: position.latitude,
            longitude: position.longitude,
            speed: position.speed,
            heading: position.heading,
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

    // Disconnect WebSocket channel
    SocketService.instance.disconnect();

    if (resolveBackend && _activeTrackingAlertId != null) {
      await ApiService.instance.resolveEmergencyAlert(_activeTrackingAlertId!);
    }

    _activeTrackingAlertId = null;
  }

  // =========================================================================
  // FIELD RESPONDER DUTY: 24/7 FOREGROUND SERVICE WITH PERSISTENT NOTIFICATION
  // "🛡️ DEVI Responder: Live Duty Active" (STAYS ALIVE WHEN PHONE IS LOCKED)
  // =========================================================================
  static StreamSubscription<Position>? _responderDutyStreamSub;
  static Timer? _responderShiftTimer;
  static bool get isResponderDutyActive => _responderDutyStreamSub != null;

  /// Starts continuous, high-priority foreground GPS tracking for DEVI Responders.
  /// Android Foreground Service with ongoing notification keeps GPS streaming
  /// even when the phone is locked, asleep, or in the responder's pocket for 10+ hours.
  static Future<bool> startResponderDuty({
    required String agentId,
    required String agentName,
    int shiftHours = 8,
    int intervalSeconds = 10,
    Function(Position position)? onUpdate,
    Function()? onShiftExpired,
  }) async {
    // 1. Cancel any active duty tracking
    await stopResponderDuty(agentId: agentId, notifyBackend: false);

    debugPrint('🛡️ [STARTING RESPONDER DUTY] Agent: $agentName ($agentId), Shift: ${shiftHours}h, Interval: ${intervalSeconds}s');

    // 2. Request fine location & background permissions if needed
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        debugPrint('⚠️ Location permission denied for Responder Duty.');
        return false;
      }
    }
    if (permission == LocationPermission.deniedForever) {
      debugPrint('⚠️ Location permission denied forever.');
      return false;
    }

    // 3. Configure Android Foreground Service with Persistent Notification
    late LocationSettings locationSettings;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 2, // Ultra-responsive: updates every 2 meters
        forceLocationManager: true,
        intervalDuration: Duration(seconds: intervalSeconds <= 2 ? intervalSeconds : 2),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: "🛡️ DEVI Responder: Live Duty Active",
          notificationText: "Live GPS is streaming to Control Room. Duty shift is active.",
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

    // 4. Start Position Stream
    try {
      _responderDutyStreamSub = Geolocator.getPositionStream(
        locationSettings: locationSettings,
      ).listen((Position position) {
        debugPrint('🛰️ [DUTY GPS PUSH] Lat: ${position.latitude}, Lng: ${position.longitude}, Acc: ${position.accuracy}m');
        onUpdate?.call(position);

        // Push location update to backend API
        _pushResponderLocation(
          agentId: agentId,
          latitude: position.latitude,
          longitude: position.longitude,
          heading: position.heading,
          speed: position.speed,
        );
      }, onError: (e) {
        debugPrint('⚠️ Error in Responder Duty GPS Stream: $e');
      });

      // 5. Shift Duration Auto-Expire Timer
      if (shiftHours > 0) {
        _responderShiftTimer?.cancel();
        _responderShiftTimer = Timer(Duration(hours: shiftHours), () {
          debugPrint('⏰ [SHIFT EXPIRED] Auto-stopping responder duty after ${shiftHours}h');
          stopResponderDuty(agentId: agentId);
          onShiftExpired?.call();
        });
      }

      return true;
    } catch (e) {
      debugPrint('⚠️ Failed to initiate Responder Duty GPS Stream: $e');
      return false;
    }
  }

  /// Sends location update to backend server
  static Future<void> _pushResponderLocation({
    required String agentId,
    required double latitude,
    required double longitude,
    double heading = 0.0,
    double speed = 0.0,
  }) async {
    try {
      final url = Uri.parse('${ApiService.baseUrl}/dashboard/agents/$agentId/location');
      await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'latitude': latitude,
          'longitude': longitude,
          'heading': heading,
          'speed': speed,
        }),
      ).timeout(const Duration(seconds: 4));
    } catch (_) {}
  }

  /// Stops the responder duty stream and dismisses the ongoing notification
  static Future<void> stopResponderDuty({
    required String agentId,
    bool notifyBackend = true,
  }) async {
    _responderShiftTimer?.cancel();
    _responderShiftTimer = null;

    if (_responderDutyStreamSub != null) {
      debugPrint('🛑 [STOPPING RESPONDER DUTY] Dismissing notification & canceling stream');
      await _responderDutyStreamSub?.cancel();
      _responderDutyStreamSub = null;
    }

    if (notifyBackend && agentId.isNotEmpty) {
      try {
        final url = Uri.parse('${ApiService.baseUrl}/dashboard/agents/$agentId/duty');
        await http.post(
          url,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'status': 'OFF_DUTY'}),
        ).timeout(const Duration(seconds: 4));
      } catch (_) {}
    }
  }

  /// Checks if location permissions are currently granted.
  static Future<bool> hasPermission() async {
    final permission = await Geolocator.checkPermission();
    return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
  }

  /// Calculates straight-line distance in meters between two GPS coordinates using pure math.
  static double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
    return MapUtils.calculateDistanceInMeters(lat1, lon1, lat2, lon2);
  }
}

