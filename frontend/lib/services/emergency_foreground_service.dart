import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Bridge to the Android `EmergencyService` (native foreground service).
///
/// While an SOS is active it records 2 minutes of video/audio evidence and keeps live
/// location allowed even when the app is minimized or a phone call is in progress.
/// Other platforms report [isSupported] = false and callers use their normal path.
class EmergencyForegroundService {
  EmergencyForegroundService._();

  static const MethodChannel _channel = MethodChannel('com.devi.app/emergency');

  static bool get isSupported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// True after the service was started for the current SOS (until [stop]).
  static bool isRunning = false;

  /// Starts the foreground service. Must be called while the app is visible (Android rule).
  static Future<bool> start({bool record = true}) async {
    if (!isSupported) return false;
    try {
      final started = await _channel.invokeMethod<bool>('start', {'record': record}) ?? false;
      isRunning = started;
      return started;
    } catch (e) {
      debugPrint('⚠️ EmergencyForegroundService.start failed: $e');
      return false;
    }
  }

  /// Gives the native service what it needs to tell the server if the user swipes the app away.
  static Future<void> setAlertContext({
    required String alertId,
    required String apiBaseUrl,
    String? controlToken,
  }) async {
    if (!isSupported || controlToken == null) return;
    try {
      await _channel.invokeMethod('setAlertContext', {
        'alertId': alertId,
        'apiBaseUrl': apiBaseUrl,
        'controlToken': controlToken,
      });
    } catch (e) {
      debugPrint('⚠️ EmergencyForegroundService.setAlertContext failed: $e');
    }
  }

  /// Stops the evidence recording and returns the recorded file path (null if none).
  static Future<String?> stopRecording() async {
    if (!isSupported) return null;
    try {
      return await _channel.invokeMethod<String>('stopRecording');
    } catch (e) {
      debugPrint('⚠️ EmergencyForegroundService.stopRecording failed: $e');
      return null;
    }
  }

  /// Ends the service (call when the SOS is resolved).
  static Future<void> stop() async {
    if (!isSupported) return;
    isRunning = false;
    try {
      await _channel.invokeMethod('stop');
    } catch (e) {
      debugPrint('⚠️ EmergencyForegroundService.stop failed: $e');
    }
  }

  /// Sends the app to the background (home screen) without closing it.
  static Future<void> minimizeApp() async {
    if (!isSupported) return;
    try {
      await _channel.invokeMethod('minimize');
    } catch (e) {
      debugPrint('⚠️ EmergencyForegroundService.minimizeApp failed: $e');
    }
  }
}
