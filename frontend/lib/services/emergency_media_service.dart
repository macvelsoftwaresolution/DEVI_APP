import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';
import 'emergency_recorder_stub.dart';
import 'emergency_recorder_stub.dart'
    if (dart.library.html) 'emergency_recorder_web.dart'
    if (dart.library.io) 'emergency_recorder_mobile.dart' as platform_impl;

class EmergencyMediaService extends ChangeNotifier {
  static final EmergencyMediaService instance = EmergencyMediaService._internal();
  factory EmergencyMediaService() => instance;
  EmergencyMediaService._internal();

  PlatformEmergencyRecorder? _recorder;
  Timer? _countdownTimer;

  static const int totalRecordingSeconds = 120; // 2 Minutes
  int _remainingSeconds = totalRecordingSeconds;
  bool _isRecording = false;
  String? _lastRecordedUrl;
  DateTime? _lastRecordedTime;

  bool get isRecording => _isRecording;
  int get remainingSeconds => _remainingSeconds;
  int get totalSeconds => totalRecordingSeconds;
  String? get lastRecordedUrl => _lastRecordedUrl;
  DateTime? get lastRecordedTime => _lastRecordedTime;

  double get progress =>
      1.0 - (_remainingSeconds.toDouble() / totalRecordingSeconds.toDouble());

  String get remainingFormatted {
    final m = (_remainingSeconds ~/ 60).toString().padLeft(2, '0');
    final s = (_remainingSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  PlatformEmergencyRecorder _getRecorder() {
    return _recorder ??= platform_impl.getPlatformEmergencyRecorder();
  }

  /// Starts the automatic 2-minute (120 seconds) video & audio recording
  Future<bool> start2MinEmergencyRecording() async {
    if (_isRecording) return true;

    try {
      _remainingSeconds = totalRecordingSeconds;
      final recorder = _getRecorder();
      final started = await recorder.startRecording();

      if (!started) {
        debugPrint('⚠️ EmergencyMediaService: Failed to start hardware recording.');
        // Fallback: Continue countdown so app still behaves consistently
      }

      _isRecording = true;
      notifyListeners();

      _countdownTimer?.cancel();
      _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (_remainingSeconds > 1) {
          _remainingSeconds--;
          notifyListeners();
        } else {
          _remainingSeconds = 0;
          timer.cancel();
          stopEmergencyRecording(isAutoFinished: true);
        }
      });

      return true;
    } catch (e) {
      debugPrint('Error starting emergency recording: $e');
      _isRecording = false;
      notifyListeners();
      return false;
    }
  }

  /// Stops recording and finalizes the video/audio evidence
  Future<String?> stopEmergencyRecording({bool isAutoFinished = false}) async {
    if (!_isRecording && _countdownTimer == null) {
      return _lastRecordedUrl;
    }

    _countdownTimer?.cancel();
    _countdownTimer = null;
    _isRecording = false;

    try {
      final recorder = _getRecorder();
      final url = await recorder.stopRecording();
      if (url != null && url.isNotEmpty) {
        _lastRecordedUrl = url;
        _lastRecordedTime = DateTime.now();
      }
    } catch (e) {
      debugPrint('Error stopping emergency recorder: $e');
    }

    notifyListeners();
    return _lastRecordedUrl;
  }

  /// Opens the recorded video for playback or download
  Future<void> viewEvidence() async {
    if (_lastRecordedUrl == null) return;
    try {
      final uri = Uri.parse(_lastRecordedUrl!);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      }
    } catch (e) {
      debugPrint('Error launching recorded video URL: $e');
    }
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _recorder?.dispose();
    super.dispose();
  }
}
