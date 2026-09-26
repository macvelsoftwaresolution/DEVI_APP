import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'sms_service.dart';
import 'permission_stub.dart';
import 'permission_stub.dart'
    if (dart.library.html) 'permission_web.dart'
    if (dart.library.io) 'permission_mobile.dart' as platform_impl;

class PermissionService {
  static const String _prefKey = 'safety_permissions_configured';
  static PlatformPermissionHandler? _handler;

  static PlatformPermissionHandler _getHandler() {
    return _handler ??= platform_impl.getPlatformPermissionHandler();
  }

  /// Checks if safety permissions have been configured/granted
  static Future<bool> hasSafetyPermissions() async {
    final prefs = await SharedPreferences.getInstance();
    final bool configured = prefs.getBool(_prefKey) ?? false;
    return configured;
  }

  /// Requests all upfront safety permissions: Camera, Mic, SMS, Call, Location
  static Future<bool> requestAllSafetyPermissions() async {
    // 1. Request Camera & Mic via platform handler (Web getUserMedia or Android native)
    await _getHandler().requestMediaPermissions();

    // 2. Request SMS & Call permission on mobile
    if (!kIsWeb) {
      try {
        await SmsService.requestPermission();
      } catch (e) {
        debugPrint('SMS permission request error: $e');
      }
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefKey, true);
    return true;
  }
}
