import 'sound_player_stub.dart';
import 'sound_player_stub.dart'
    if (dart.library.html) 'sound_player_web.dart'
    if (dart.library.io) 'sound_player_mobile.dart' as platform_impl;

class SoundService {
  static final SoundService instance = SoundService._internal();
  factory SoundService() => instance;
  SoundService._internal();

  PlatformSoundPlayer? _player;
  bool _isPlaying = false;

  bool get isPlaying => _isPlaying;

  PlatformSoundPlayer _getPlayer() {
    return _player ??= platform_impl.getPlatformSoundPlayer();
  }

  Future<void> playSiren() async {
    _isPlaying = true;
    await _getPlayer().play();
  }

  Future<void> stopSiren() async {
    _isPlaying = false;
    await _player?.stop();
  }

  Future<bool> toggleSiren() async {
    if (_isPlaying) {
      await stopSiren();
      return false;
    } else {
      await playSiren();
      return true;
    }
  }

  void dispose() {
    _player?.dispose();
    _player = null;
    _isPlaying = false;
  }
}
