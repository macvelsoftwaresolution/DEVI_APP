import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'sound_player_stub.dart';

class MobileSoundPlayer implements PlatformSoundPlayer {
  AudioPlayer? _player;

  Future<void> _init() async {
    if (_player == null) {
      _player = AudioPlayer();
      await _player!.setReleaseMode(ReleaseMode.loop);
      await _player!.setVolume(1.0);
    }
  }

  @override
  Future<void> play() async {
    try {
      await _init();
      await _player!.play(AssetSource('audio/siren.mp3'));
    } catch (e) {
      debugPrint('MobileSoundPlayer error: $e');
    }
  }

  @override
  Future<void> stop() async {
    try {
      await _player?.stop();
    } catch (e) {
      debugPrint('MobileSoundPlayer stop error: $e');
    }
  }

  @override
  void dispose() {
    _player?.dispose();
    _player = null;
  }
}

PlatformSoundPlayer getPlatformSoundPlayer() => MobileSoundPlayer();
