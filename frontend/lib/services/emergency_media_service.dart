import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'api_service.dart';
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
  String? _currentAlertId;
  String? _localFilePath;
  bool _isUploading = false;

  AudioPlayer? _audioPlayer;
  bool _isPlayingAudio = false;

  void setAlertId(String alertId) {
    _currentAlertId = alertId;
    // If we have a local file already recorded that was waiting for alertId, upload it now
    if (_localFilePath != null && (_lastRecordedUrl == null || !_lastRecordedUrl!.startsWith('http'))) {
      _uploadEvidenceToCloudinary(_localFilePath!);
    }
  }

  /// Fully resets emergency media state on logout or new login
  void reset() {
    _countdownTimer?.cancel();
    _countdownTimer = null;
    _isRecording = false;
    _remainingSeconds = totalRecordingSeconds;
    _lastRecordedUrl = null;
    _localFilePath = null;
    _lastRecordedTime = null;
    _currentAlertId = null;
    _isUploading = false;
    try {
      _audioPlayer?.stop();
    } catch (_) {}
    _isPlayingAudio = false;
    notifyListeners();
  }

  /// Dismisses the completed evidence banner from the UI
  void dismissEvidence() {
    try {
      _audioPlayer?.stop();
    } catch (_) {}
    _isPlayingAudio = false;
    _lastRecordedUrl = null;
    _localFilePath = null;
    _isUploading = false;
    notifyListeners();
  }

  bool get isRecording => _isRecording;
  bool get isUploading => _isUploading;
  bool get isPlayingAudio => _isPlayingAudio;
  String? get localFilePath => _localFilePath;
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
  Future<bool> start2MinEmergencyRecording({String? alertId}) async {
    _currentAlertId = (alertId != null && alertId.isNotEmpty)
        ? alertId
        : 'SOS_${DateTime.now().millisecondsSinceEpoch}';

    if (_isRecording) return true;

    try {
      _remainingSeconds = totalRecordingSeconds;
      final recorder = _getRecorder();
      final started = await recorder.startRecording();

      if (!started) {
        debugPrint('⚠️ EmergencyMediaService: Hardware recording init returned false. Continuing countdown.');
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

  /// Stops recording, finalizes media, and uploads evidence to Cloudinary
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
        _localFilePath = url;
        _lastRecordedUrl = url;
        _lastRecordedTime = DateTime.now();

        // Automatically upload recorded evidence to Cloudinary via DEVI Backend
        _uploadEvidenceToCloudinary(url);
      }
    } catch (e) {
      debugPrint('Error stopping emergency recorder: $e');
    }

    notifyListeners();
    return _lastRecordedUrl;
  }

  /// Uploads the recorded video/audio stream to Cloudinary
  Future<void> _uploadEvidenceToCloudinary(String localOrBlobUrl) async {
    _localFilePath = localOrBlobUrl;
    final alertId = (_currentAlertId != null && _currentAlertId!.isNotEmpty)
        ? _currentAlertId!
        : 'SOS_${DateTime.now().millisecondsSinceEpoch}';

    _isUploading = true;
    notifyListeners();

    try {
      debugPrint('☁️ Uploading emergency evidence for Alert #$alertId to Cloudinary (File: $localOrBlobUrl)...');
      String? remoteUrl;

      if (kIsWeb && localOrBlobUrl.startsWith('blob:')) {
        // Fetch recorded web Blob into raw bytes
        final response = await http.get(Uri.parse(localOrBlobUrl));
        if (response.statusCode == 200) {
          remoteUrl = await ApiService.instance.uploadEmergencyEvidence(
            alertId: alertId,
            fileBytes: response.bodyBytes,
            fileName: 'devi_sos_${alertId}_evidence.webm',
          );
        }
      } else {
        // Native mobile file path
        remoteUrl = await ApiService.instance.uploadEmergencyEvidence(
          alertId: alertId,
          filePath: localOrBlobUrl,
          fileName: 'devi_sos_${alertId}_evidence.mp4',
        );
      }

      if (remoteUrl != null && remoteUrl.isNotEmpty) {
        _lastRecordedUrl = remoteUrl;
        debugPrint('✅ Evidence successfully uploaded and accessible at: $remoteUrl');
      } else {
        debugPrint('ℹ️ Cloud upload response empty, keeping local playable path: $localOrBlobUrl');
      }
    } catch (e) {
      debugPrint('⚠️ Error uploading evidence to Cloudinary: $e');
    } finally {
      _isUploading = false;
      notifyListeners();
    }
  }

  /// Plays or pauses the recorded evidence directly in-app or opens Cloudinary link
  Future<void> viewEvidence() async {
    final target = _lastRecordedUrl ?? _localFilePath;
    if (target == null || target.isEmpty) {
      debugPrint('viewEvidence: No evidence media available to play');
      return;
    }

    if (_isPlayingAudio) {
      await stopAudio();
      return;
    }

    // 1. If it's a Cloudinary streaming URL, open in external video player / browser to watch the real video footage
    if (target.startsWith('http')) {
      try {
        final uri = Uri.parse(target);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
          return;
        }
      } catch (e) {
        debugPrint('Error launching Cloudinary video URL: $e');
      }
    }

    // 2. Play local recorded audio in-app directly
    try {
      _audioPlayer ??= AudioPlayer();
      await _audioPlayer!.play(DeviceFileSource(target));
      _isPlayingAudio = true;
      notifyListeners();

      _audioPlayer!.onPlayerComplete.listen((_) {
        _isPlayingAudio = false;
        notifyListeners();
      });
      return;
    } catch (e) {
      debugPrint('In-app AudioPlayer error: $e');
    }
  }

  Future<void> stopAudio() async {
    try {
      await _audioPlayer?.stop();
    } catch (_) {}
    _isPlayingAudio = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _recorder?.dispose();
    _audioPlayer?.dispose();
    super.dispose();
  }
}
