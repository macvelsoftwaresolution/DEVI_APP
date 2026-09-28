import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class SmsService {
  static const MethodChannel _channel = MethodChannel('com.devi.app/sms');

  /// Checks whether SEND_SMS permission has been granted
  static Future<bool> hasPermission() async {
    if (kIsWeb) return true;
    try {
      final bool res = await _channel.invokeMethod('checkPermission');
      return res;
    } catch (e) {
      debugPrint('Error checking SMS permission: $e');
      return false;
    }
  }

  /// Requests the user to grant SEND_SMS permission
  static Future<bool> requestPermission() async {
    if (kIsWeb) return true;
    try {
      final bool res = await _channel.invokeMethod('requestPermission');
      return res;
    } catch (e) {
      debugPrint('Error requesting SMS permission: $e');
      return false;
    }
  }

  /// Sends a direct silent SMS to a single phone number via the phone SIM
  /// (Permanently disabled per user preference in favor of WhatsApp Cloud API)
  static Future<bool> sendSilentSms({
    required String phone,
    required String message,
  }) async {
    debugPrint('ℹ️ [NORMAL SMS DISABLED] Normal SMS is disabled. WhatsApp is active.');
    return false;
  }

  /// Broadcasts emergency SMS to multiple guardian phone numbers
  /// (Completely disabled - Normal SMS removed per user request)
  static Future<int> broadcastEmergencySms({
    required List<String> phoneNumbers,
    required String userName,
    String? location,
    String? alertId,
  }) async {
    debugPrint('ℹ️ [NORMAL SMS REMOVED] Normal SMS broadcast removed. Alerts dispatched via WhatsApp & Cloud Gateway.');
    return 0;
  }

  /// Initiates a phone call to the primary guardian or emergency number (112)
  static Future<bool> makePhoneCall(String phone) async {
    final clean = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (clean.isEmpty) return false;

    if (kIsWeb) {
      debugPrint('🌐 [WEB PHONE CALL SIMULATED] Calling: $clean');
      return true;
    }

    try {
      final bool? res = await _channel.invokeMethod('makeCall', {'phone': clean});
      return res ?? true;
    } catch (e) {
      debugPrint('Error making phone call to $clean: $e');
      return false;
    }
  }
}
