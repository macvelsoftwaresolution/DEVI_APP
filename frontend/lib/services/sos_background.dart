import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:workmanager/workmanager.dart';
import 'api_service.dart';
import 'sos_store.dart';

/// Sends a pending SOS when the app is closed or killed (L9).
///
/// An SOS that did not reach the server is saved first (sos_store.dart). This schedules an
/// Android WorkManager task that runs once there is internet, even after the app is swiped
/// away or the phone restarts, and sends the saved request again with the same idempotency key.
/// The server never makes a second alert for it. Until the server answers the task is retried,
/// with growing gaps, for as long as the SOS is not older than SosStore.maxAge.
///
/// The background run has no screen and no location permission, so it sends the location
/// saved at the press. The app, when open, keeps its own retry loop with fresh GPS too.
/// Android only: on other platforms the app's own loop and the next app start do the work.

const String _taskName = 'devi.sos.send';
const String _uniqueName = 'devi-sos-pending';
// Same key as AppState uses for the login token
const String _authTokenKey = 'devi_auth_token';

@pragma('vm:entry-point')
void sosBackgroundDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task != _taskName) return true;
    return SosBackground.sendPendingOnce();
  });
}

class SosBackground {
  SosBackground._();

  static bool get isSupported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static bool _initialized = false;

  static Future<void> init() async {
    if (!isSupported || _initialized) return;
    try {
      await Workmanager().initialize(sosBackgroundDispatcher);
      _initialized = true;
    } catch (e) {
      debugPrint('⚠️ [SOS BACKGROUND] WorkManager not available: $e');
    }
  }

  /// Runs once there is internet; keeps an already scheduled run and its backoff
  static Future<void> schedule() async {
    if (!isSupported) return;
    await init();
    try {
      await Workmanager().registerOneOffTask(
        _uniqueName,
        _taskName,
        constraints: Constraints(networkType: NetworkType.connected),
        existingWorkPolicy: ExistingWorkPolicy.keep,
        backoffPolicy: BackoffPolicy.exponential,
        backoffPolicyDelay: const Duration(seconds: 30),
      );
      debugPrint('🔁 [SOS BACKGROUND] Scheduled: the SOS is sent as soon as there is internet');
    } catch (e) {
      debugPrint('⚠️ [SOS BACKGROUND] Not scheduled: $e');
    }
  }

  static Future<void> cancel() async {
    if (!isSupported || !_initialized) return;
    try {
      await Workmanager().cancelByUniqueName(_uniqueName);
    } catch (_) {}
  }

  /// One try. True when there is nothing left to do (sent, nothing saved, or the user is safe);
  /// false asks WorkManager to try again later.
  static Future<bool> sendPendingOnce() async {
    final record = await SosStore.load();
    if (record == null || !record.isPending || record.request == null) return true;

    final api = ApiService.instance;
    if (api.authToken == null) {
      try {
        final token = await const FlutterSecureStorage().read(key: _authTokenKey);
        if (token != null && token.isNotEmpty) api.setAuthToken(token);
      } catch (_) {}
    }

    final data = await api.sendSosPayload(record.request!);
    final alertId = data?['id']?.toString();
    if (alertId == null) {
      debugPrint('🔁 [SOS BACKGROUND] Server not reached, trying again later');
      return false;
    }
    // The user may have said "I am safe" while this was being sent
    final now = await SosStore.load();
    if (now == null) {
      await api.resolveEmergencyAlert(alertId);
      return true;
    }
    await SosStore.markDelivered(alertId, data?['controlToken'] as String?);
    debugPrint('✅ [SOS BACKGROUND] Delivered: alert $alertId');
    return true;
  }
}
