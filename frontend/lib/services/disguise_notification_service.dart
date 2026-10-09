import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Service to handle stealth disguise notifications masquerading as Flipkart
/// to protect the victim when SOS is triggered.
class DisguiseNotificationService {
  static const MethodChannel _channel = MethodChannel('com.devi.app/notifications');

  /// Displays the top Heads-Up disguised notification masquerading as Flipkart
  static Future<void> showFlipkartDisguise() async {
    if (kIsWeb) return;
    try {
      await _channel.invokeMethod('showFlipkartNotification');
      debugPrint('🛍️ [DISGUISE NOTIFICATION] Flipkart stealth notification triggered.');
    } catch (e) {
      debugPrint('⚠️ Disguise notification invocation failed: $e');
    }
  }

  /// Cancels the disguised notification when the emergency is safely resolved
  static Future<void> cancelDisguise() async {
    if (kIsWeb) return;
    try {
      await _channel.invokeMethod('cancelNotification');
      debugPrint('🛡️ [DISGUISE NOTIFICATION] Disguise notification dismissed.');
    } catch (e) {
      debugPrint('⚠️ Disguise notification cancel failed: $e');
    }
  }
}
