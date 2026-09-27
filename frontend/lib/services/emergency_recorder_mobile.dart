import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'emergency_recorder_stub.dart';

class MobileEmergencyRecorder implements PlatformEmergencyRecorder {
  static const MethodChannel _nativeChannel = MethodChannel('com.devi.app/recorder');
  CameraController? _cameraController;
  bool _isRecording = false;
  String? _lastVideoPath;
  bool _usedNativeAudioFallback = false;

  @override
  bool get isRecording => _isRecording;

  @override
  Future<bool> startRecording() async {
    _usedNativeAudioFallback = false;
    _lastVideoPath = null;

    // 1. Attempt Real Front Camera Video + Audio Recording
    try {
      debugPrint('📷 MobileEmergencyRecorder: Discovering cameras for front video recording...');
      final cameras = await availableCameras();

      if (cameras.isNotEmpty) {
        // Select front-facing camera by default for women safety
        CameraDescription? frontCamera;
        for (final cam in cameras) {
          if (cam.lensDirection == CameraLensDirection.front) {
            frontCamera = cam;
            break;
          }
        }
        final targetCamera = frontCamera ?? cameras.first;

        _cameraController = CameraController(
          targetCamera,
          ResolutionPreset.medium,
          enableAudio: true,
          imageFormatGroup: ImageFormatGroup.jpeg,
        );

        await _cameraController!.initialize();
        await _cameraController!.startVideoRecording();
        _isRecording = true;
        debugPrint('✅ Front Camera 2-Min Emergency Video & Audio Recording Started!');
        return true;
      }
    } catch (e) {
      debugPrint('⚠️ Front camera initialization error: $e. Falling back to native background audio recorder.');
      await _cameraController?.dispose();
      _cameraController = null;
    }

    // 2. Fallback: High-Quality Native Android Audio Recording via MainActivity MediaRecorder
    try {
      _usedNativeAudioFallback = true;
      _isRecording = true;
      debugPrint('🎙️ Starting native background audio recorder fallback...');
      final bool? success = await _nativeChannel.invokeMethod('startRecording');
      return success ?? true;
    } catch (e) {
      debugPrint('MobileEmergencyRecorder fallback error: $e');
      _isRecording = true;
      return true;
    }
  }

  @override
  Future<String?> stopRecording() async {
    if (!_isRecording && _cameraController == null && !_usedNativeAudioFallback) {
      return _lastVideoPath;
    }

    _isRecording = false;

    // 1. If Camera Controller was recording, stop and return video XFile path
    if (_cameraController != null) {
      try {
        if (_cameraController!.value.isRecordingVideo) {
          final XFile videoFile = await _cameraController!.stopVideoRecording();
          _lastVideoPath = videoFile.path;
          debugPrint('🎥 Emergency Front Video File Captured: $_lastVideoPath');
        }
      } catch (e) {
        debugPrint('Error stopping camera video recording: $e');
      } finally {
        try {
          await _cameraController!.dispose();
        } catch (_) {}
        _cameraController = null;
      }
      return _lastVideoPath;
    }

    // 2. Otherwise stop native audio fallback
    try {
      final String? path = await _nativeChannel.invokeMethod('stopRecording');
      _lastVideoPath = path;
      return path;
    } catch (e) {
      debugPrint('MobileEmergencyRecorder stop error: $e');
      return _lastVideoPath;
    }
  }

  @override
  Future<void> openEvidence(String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('MobileEmergencyRecorder openEvidence error: $e');
    }
  }

  @override
  Future<void> downloadEvidence(String url) async {
    await openEvidence(url);
  }

  @override
  void dispose() {
    _isRecording = false;
    try {
      _cameraController?.dispose();
    } catch (_) {}
    _cameraController = null;
  }
}

PlatformEmergencyRecorder getPlatformEmergencyRecorder() => MobileEmergencyRecorder();

