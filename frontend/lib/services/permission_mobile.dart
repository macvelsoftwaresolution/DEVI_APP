import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:geolocator/geolocator.dart';
import 'permission_stub.dart';

class MobilePermissionHandler implements PlatformPermissionHandler {
  static const MethodChannel _nativeChannel = MethodChannel('com.devi.app/sms');

  @override
  Future<bool> requestMediaPermissions() async {
    // iOS has no native batch: ask the same permissions through the plugins, one after another
    // (iOS has no call permission; a call shows the system "Call" confirmation instead)
    if (Platform.isIOS) return _requestIosPermissions();
    try {
      final bool? res = await _nativeChannel.invokeMethod('requestAllSafetyPermissions');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _requestIosPermissions() async {
    var granted = true;
    try {
      var location = await Geolocator.checkPermission();
      if (location == LocationPermission.denied) {
        location = await Geolocator.requestPermission();
      }
      granted &= location == LocationPermission.whileInUse || location == LocationPermission.always;
    } catch (e) {
      debugPrint('iOS location permission error: $e');
      granted = false;
    }
    try {
      if (!await FlutterContacts.permissions.has(PermissionType.read)) {
        final status = await FlutterContacts.permissions.request(PermissionType.read);
        granted &= status == PermissionStatus.granted || status == PermissionStatus.limited;
      }
    } catch (e) {
      debugPrint('iOS contacts permission error: $e');
      granted = false;
    }
    return granted;
  }
}

PlatformPermissionHandler getPlatformPermissionHandler() => MobilePermissionHandler();
