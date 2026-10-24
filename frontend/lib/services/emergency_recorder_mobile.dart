import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';
import 'emergency_foreground_service.dart';
import 'emergency_recorder_stub.dart';

/// Mobile evidence recorder.
/// - Android: recording runs inside the native [EmergencyForegroundService], so it keeps going
///   when the app is minimized or a phone call starts.
/// - iOS: front camera via the camera plugin (works while the app is in the foreground).
class MobileEmergencyRecorder implements PlatformEmergencyRecorder {
  CameraController? _cameraController;
  bool _isRecording = false;
  bool _usingNativeService = false;
  String? _lastVideoPath;

  @override
  bool get isRecording => _isRecording;

  @override
  Future<bool> startRecording() async {
    _lastVideoPath = null;

    if (EmergencyForegroundService.isSupported) {
      _usingNativeService = await EmergencyForegroundService.start(record: true);
      _isRecording = _usingNativeService;
      if (_usingNativeService) {
        debugPrint('✅ Background evidence recording started in EmergencyService');
      }
      return _usingNativeService;
    }

    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) return false;

      final targetCamera = cameras.firstWhere(
        (cam) => cam.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      _cameraController = CameraController(
        targetCamera,
        ResolutionPreset.medium,
        enableAudio: true,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await _cameraController!.initialize();
      await _cameraController!.startVideoRecording();
      _isRecording = true;
      debugPrint('✅ Front camera evidence recording started');
      return true;
    } catch (e) {
      debugPrint('⚠️ Front camera recording failed: $e');
      await _cameraController?.dispose();
      _cameraController = null;
      return false;
    }
  }

  @override
  Future<String?> stopRecording() async {
    if (!_isRecording) return _lastVideoPath;
    _isRecording = false;

    if (_usingNativeService) {
      _lastVideoPath = await EmergencyForegroundService.stopRecording();
      debugPrint('🎥 Evidence file from EmergencyService: $_lastVideoPath');
      return _lastVideoPath;
    }

    final controller = _cameraController;
    if (controller == null) return _lastVideoPath;
    try {
      if (controller.value.isRecordingVideo) {
        final XFile videoFile = await controller.stopVideoRecording();
        _lastVideoPath = videoFile.path;
        debugPrint('🎥 Evidence video captured: $_lastVideoPath');
      }
    } catch (e) {
      debugPrint('Error stopping camera video recording: $e');
    } finally {
      try {
        await controller.dispose();
      } catch (_) {}
      _cameraController = null;
    }
    return _lastVideoPath;
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
