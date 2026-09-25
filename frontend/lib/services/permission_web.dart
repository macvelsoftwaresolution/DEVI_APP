// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'package:flutter/foundation.dart';
import 'permission_stub.dart';

class WebPermissionHandler implements PlatformPermissionHandler {
  @override
  Future<bool> requestMediaPermissions() async {
    try {
      final mediaDevices = html.window.navigator.mediaDevices;
      if (mediaDevices != null) {
        final stream = await mediaDevices.getUserMedia({
          'video': true,
          'audio': true,
        });
        for (final track in stream.getTracks()) {
          track.stop();
        }
        debugPrint('🌐 Web Camera & Mic permissions granted!');
        return true;
      }
    } catch (e) {
      debugPrint('Web camera/mic permission prompt error or denied: $e');
    }
    return false;
  }
}

PlatformPermissionHandler getPlatformPermissionHandler() => WebPermissionHandler();
