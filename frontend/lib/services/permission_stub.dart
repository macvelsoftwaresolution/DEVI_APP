abstract class PlatformPermissionHandler {
  Future<bool> requestMediaPermissions();
}

PlatformPermissionHandler getPlatformPermissionHandler() =>
    throw UnsupportedError('Cannot create platform permission handler');
