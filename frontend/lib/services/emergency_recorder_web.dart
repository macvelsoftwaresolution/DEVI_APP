// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:async';
import 'dart:html' as html;
import 'package:flutter/foundation.dart';
import 'emergency_recorder_stub.dart';

class WebEmergencyRecorder implements PlatformEmergencyRecorder {
  html.MediaStream? _mediaStream;
  html.MediaRecorder? _mediaRecorder;
  final List<html.Blob> _recordedChunks = [];
  bool _isRecording = false;
  Completer<String?>? _stopCompleter;
  String? _lastVideoUrl;

  @override
  bool get isRecording => _isRecording;

  @override
  Future<bool> startRecording() async {
    try {
      _recordedChunks.clear();
      _stopCompleter = null;

      final mediaDevices = html.window.navigator.mediaDevices;
      if (mediaDevices == null) {
        debugPrint('WebEmergencyRecorder: MediaDevices not supported');
        return false;
      }

      // Request both video and audio stream from user
      final stream = await mediaDevices.getUserMedia({
        'video': {
          'facingMode': 'user',
          'width': {'ideal': 1280},
          'height': {'ideal': 720},
        },
        'audio': true,
      });

      _mediaStream = stream;

      // Determine best supported MIME type
      String mimeType = 'video/webm;codecs=vp8,opus';
      if (!html.MediaRecorder.isTypeSupported(mimeType)) {
        if (html.MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        } else if (html.MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else {
          mimeType = '';
        }
      }

      final options = mimeType.isNotEmpty ? {'mimeType': mimeType} : null;
      _mediaRecorder = options != null
          ? html.MediaRecorder(stream, options)
          : html.MediaRecorder(stream);

      _mediaRecorder!.addEventListener('dataavailable', (html.Event event) {
        try {
          final dynamic dynEvent = event;
          final dynamic data = dynEvent.data;
          if (data is html.Blob && data.size > 0) {
            _recordedChunks.add(data);
          }
        } catch (e) {
          debugPrint('Error handling dataavailable: $e');
        }
      });

      _mediaRecorder!.addEventListener('stop', (html.Event event) {
        try {
          if (_recordedChunks.isNotEmpty) {
            final superBlob = html.Blob(
              _recordedChunks,
              mimeType.isNotEmpty ? mimeType : 'video/webm',
            );
            _lastVideoUrl = html.Url.createObjectUrlFromBlob(superBlob);
            debugPrint('WebEmergencyRecorder: Recording saved to $_lastVideoUrl');
            _stopCompleter?.complete(_lastVideoUrl);
          } else {
            _stopCompleter?.complete(null);
          }
        } catch (e) {
          debugPrint('Error creating recorded blob: $e');
          _stopCompleter?.complete(null);
        } finally {
          _cleanupStreams();
        }
      });

      // Record in 1000ms slices so data is collected incrementally
      _mediaRecorder!.start(1000);
      _isRecording = true;
      debugPrint('WebEmergencyRecorder: Video & Audio 2-minute recording started!');
      return true;
    } catch (e) {
      debugPrint('WebEmergencyRecorder startRecording error: $e');
      _cleanupStreams();
      _isRecording = false;
      return false;
    }
  }

  void _cleanupStreams() {
    try {
      if (_mediaStream != null) {
        for (final track in _mediaStream!.getTracks()) {
          track.stop();
        }
        _mediaStream = null;
      }
    } catch (e) {
      debugPrint('Error stopping media tracks: $e');
    }
  }

  @override
  Future<String?> stopRecording() async {
    if (!_isRecording || _mediaRecorder == null) {
      return _lastVideoUrl;
    }

    _isRecording = false;
    _stopCompleter = Completer<String?>();

    try {
      if (_mediaRecorder!.state != 'inactive') {
        _mediaRecorder!.stop();
      } else {
        _cleanupStreams();
        _stopCompleter?.complete(_lastVideoUrl);
      }
    } catch (e) {
      debugPrint('WebEmergencyRecorder stop error: $e');
      _cleanupStreams();
      return _lastVideoUrl;
    }

    return _stopCompleter!.future.timeout(
      const Duration(seconds: 4),
      onTimeout: () {
        _cleanupStreams();
        return _lastVideoUrl;
      },
    );
  }

  @override
  void dispose() {
    _isRecording = false;
    try {
      if (_mediaRecorder != null && _mediaRecorder!.state != 'inactive') {
        _mediaRecorder!.stop();
      }
    } catch (_) {}
    _cleanupStreams();
  }
}

PlatformEmergencyRecorder getPlatformEmergencyRecorder() => WebEmergencyRecorder();
