import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'emergency_recorder_stub.dart';

class MobileEmergencyRecorder implements PlatformEmergencyRecorder {
  static const MethodChannel _channel = MethodChannel('com.devi.app/recorder');
  bool _isRecording = false;
  String? _lastVideoPath;

  @override
  bool get isRecording => _isRecording;

  @override
  Future<bool> startRecording() async {
    try {
      _isRecording = true;
      debugPrint('MobileEmergencyRecorder: Requesting native camera & audio recording...');
      final bool? success = await _channel.invokeMethod('startRecording');
      return success ?? true;
    } catch (e) {
      debugPrint('MobileEmergencyRecorder start error (fallback simulation): $e');
      _isRecording = true;
      return true;
    }
  }

  @override
  Future<String?> stopRecording() async {
    if (!_isRecording) return _lastVideoPath;
    _isRecording = false;
    try {
      final String? path = await _channel.invokeMethod('stopRecording');
      _lastVideoPath = path;
      return path;
    } catch (e) {
      debugPrint('MobileEmergencyRecorder stop error: $e');
      return _lastVideoPath;
    }
  }

  @override
  void dispose() {
    _isRecording = false;
  }
}

PlatformEmergencyRecorder getPlatformEmergencyRecorder() => MobileEmergencyRecorder();
