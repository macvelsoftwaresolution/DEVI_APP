/// Feature switches decided by the product team.
library;

/// 2-minute camera + microphone evidence recording during an SOS.
/// Off until Phase 2: no recording, no upload, and camera, microphone and notifications
/// (used only by the recording service) are not asked for: 3 fewer permission prompts
/// on first run. The code is kept as it is.
///
/// Phase 2: set this to true AND restore the commented camera/microphone/notification lines
/// in android/app/src/main/AndroidManifest.xml and MainActivity.kt (search "PHASE 2"), and put
/// recording back in lib/legal/terms_content.dart (bump its version) and web/public/privacy.
const bool kEvidenceRecordingEnabled = false;
