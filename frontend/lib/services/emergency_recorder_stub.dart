abstract class PlatformEmergencyRecorder {
  Future<bool> startRecording();
  Future<String?> stopRecording();
  bool get isRecording;
  void dispose();
}

PlatformEmergencyRecorder getPlatformEmergencyRecorder() =>
    throw UnsupportedError('Cannot create platform emergency recorder');
