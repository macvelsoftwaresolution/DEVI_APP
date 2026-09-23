// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'package:flutter/foundation.dart';
import 'sound_player_stub.dart';

class WebSoundPlayer implements PlatformSoundPlayer {
  html.AudioElement? _audio;

  @override
  Future<void> play() async {
    final candidateUrls = [
      'assets/audio/siren.mp3',
      'assets/assets/audio/siren.mp3',
      'audio/siren.mp3',
    ];

    for (final url in candidateUrls) {
      try {
        _audio?.pause();
        _audio = html.AudioElement(url)
          ..loop = true
          ..volume = 1.0;
        await _audio!.play();
        return;
      } catch (e) {
        debugPrint('WebSoundPlayer candidate failed ($url): $e');
      }
    }
  }

  @override
  Future<void> stop() async {
    try {
      _audio?.pause();
      if (_audio != null) {
        _audio!.currentTime = 0;
      }
    } catch (e) {
      debugPrint('WebSoundPlayer stop error: $e');
    }
  }

  @override
  void dispose() {
    _audio?.pause();
    _audio = null;
  }
}

PlatformSoundPlayer getPlatformSoundPlayer() => WebSoundPlayer();
