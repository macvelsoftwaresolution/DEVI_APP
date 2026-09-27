abstract class PlatformEmergencyRecorder {
  Future<bool> startRecording();
  Future<String?> stopRecording();
  bool get isRecording;
  void dispose();
  Future<void> openEvidence(String url);
  Future<void> downloadEvidence(String url);
}

PlatformEmergencyRecorder getPlatformEmergencyRecorder() =>
    throw UnsupportedError('Cannot create platform emergency recorder');

