abstract class PlatformSoundPlayer {
  Future<void> play();
  Future<void> stop();
  void dispose();
}

PlatformSoundPlayer getPlatformSoundPlayer() =>
    throw UnsupportedError('Cannot create platform sound player');
