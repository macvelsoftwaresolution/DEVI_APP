import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';
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

  /// Requests all upfront safety permissions: Camera, Mic, Call, Location, Contacts, Notifications
  static Future<bool> requestAllSafetyPermissions() async {
    // Web: camera & mic via getUserMedia. Mobile: one native batch with every permission
    // (asking twice made a denied permission pop up again straight away).
    await _getHandler().requestMediaPermissions();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefKey, true);
    return true;
  }
}
