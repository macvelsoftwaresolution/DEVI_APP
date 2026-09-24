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
  static Future<bool> sendSilentSms({
    required String phone,
    required String message,
  }) async {
    if (kIsWeb) {
      debugPrint('🌐 [WEB SMS SIMULATED] To: $phone, Message: $message');
      return true;
    }
    try {
      final bool res = await _channel.invokeMethod('sendSms', {
        'phone': phone,
        'message': message,
      });
      return res;
    } catch (e) {
      debugPrint('Error sending silent SMS to $phone: $e');
      return false;
    }
  }

  /// Broadcasts emergency SMS to multiple guardian phone numbers
  static Future<int> broadcastEmergencySms({
    required List<String> phoneNumbers,
    required String userName,
    String? location,
  }) async {
    if (phoneNumbers.isEmpty) return 0;

    // Check or request permission if running on Android
    if (!kIsWeb) {
      bool permitted = await hasPermission();
      if (!permitted) {
        permitted = await requestPermission();
      }
      if (!permitted) {
        debugPrint('⚠️ SMS permission denied by user.');
        return 0;
      }
    }

    final String name = userName.trim().isNotEmpty ? userName.trim() : 'User';
    final String locPart = (location != null && location.trim().isNotEmpty)
        ? ' Location: $location'
        : '';

    final now = DateTime.now();
    final timeStr =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
    final alertRef = now.millisecondsSinceEpoch.toString().substring(7);

    final String distressMessage =
        'EMERGENCY ALERT from DEVI App!\n'
        '$name is in danger and triggered SOS at $timeStr (Ref: #$alertRef).$locPart\n'
        'Please call or reach out immediately!';

    int successCount = 0;
    for (final phone in phoneNumbers) {
      final cleanPhone = phone.replaceAll(RegExp(r'[^\d+]'), '');
      if (cleanPhone.isNotEmpty) {
        final ok = await sendSilentSms(phone: cleanPhone, message: distressMessage);
        if (ok) {
          successCount++;
        }
      }
    }
    return successCount;
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
