import 'package:flutter/services.dart';
import 'permission_stub.dart';

class MobilePermissionHandler implements PlatformPermissionHandler {
  static const MethodChannel _nativeChannel = MethodChannel('com.devi.app/sms');

  @override
  Future<bool> requestMediaPermissions() async {
    try {
      final bool? res = await _nativeChannel.invokeMethod('requestAllSafetyPermissions');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }
}

PlatformPermissionHandler getPlatformPermissionHandler() => MobilePermissionHandler();
