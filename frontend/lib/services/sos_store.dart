import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The SOS in progress, kept on the phone so it survives the app being closed or killed
/// (L9, L13). Encrypted storage (Android Keystore / iOS Keychain): it holds the location,
/// the guardians' numbers and the alert's control token.
///
/// - Pending: pressed but not yet accepted by the server. Holds the request, so the background
///   task (sos_background.dart) or the next app start can send it again with the same
///   idempotency key: the server never makes a second alert for it.
/// - Active: the server has it. Holds the alert id and its control token, so after a restart
///   the app still shows "I Am Safe" and can close the alert.
/// - Resolve pending: the user said "I am safe" but the server could not be told. The next
///   app start tries again, so guardians are not kept being called.
class SosRecord {
  SosRecord({
    required this.idempotencyKey,
    required this.startedAt,
    this.request,
    this.alertId,
    this.controlToken,
    this.resolvePending = false,
  });

  final String idempotencyKey;
  final DateTime startedAt;
  // The body of POST /sos/trigger, as first sent
  final Map<String, dynamic>? request;
  final String? alertId;
  final String? controlToken;
  final bool resolvePending;

  bool get isPending => alertId == null;

  SosRecord copyWith({String? alertId, String? controlToken, bool? resolvePending}) => SosRecord(
        idempotencyKey: idempotencyKey,
        startedAt: startedAt,
        request: request,
        alertId: alertId ?? this.alertId,
        controlToken: controlToken ?? this.controlToken,
        resolvePending: resolvePending ?? this.resolvePending,
      );

  Map<String, dynamic> toJson() => {
        'key': idempotencyKey,
        'at': startedAt.toIso8601String(),
        if (request != null) 'request': request,
        if (alertId != null) 'alertId': alertId,
        if (controlToken != null) 'controlToken': controlToken,
        if (resolvePending) 'resolvePending': true,
      };

  static SosRecord? fromJson(Map<String, dynamic> j) {
    final key = j['key'];
    final at = DateTime.tryParse(j['at']?.toString() ?? '');
    if (key is! String || key.isEmpty || at == null) return null;
    return SosRecord(
      idempotencyKey: key,
      startedAt: at,
      request: j['request'] is Map ? Map<String, dynamic>.from(j['request']) : null,
      alertId: j['alertId']?.toString(),
      controlToken: j['controlToken']?.toString(),
      resolvePending: j['resolvePending'] == true,
    );
  }
}

class SosStore {
  SosStore._();

  static const String _key = 'devi_active_sos';
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  /// An SOS older than this is not restored or resent: the server stops resuming alerts after
  /// 2 hours, and a day-old "I Am Safe" button would only confuse.
  static const Duration maxAge = Duration(hours: 24);

  static Future<SosRecord?> load() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return null;
      final record = SosRecord.fromJson(Map<String, dynamic>.from(jsonDecode(raw)));
      if (record == null || DateTime.now().difference(record.startedAt) > maxAge) {
        await clear();
        return null;
      }
      return record;
    } catch (e) {
      debugPrint('⚠️ [SOS STORE] Could not read the saved SOS: $e');
      return null;
    }
  }

  static Future<void> save(SosRecord record) async {
    try {
      await _storage.write(key: _key, value: jsonEncode(record.toJson()));
    } catch (e) {
      debugPrint('⚠️ [SOS STORE] Could not save the SOS: $e');
    }
  }

  /// Saved before the first send, so a kill at any moment after the press can still send it
  static Future<void> savePending({required String idempotencyKey, required Map<String, dynamic> request}) =>
      save(SosRecord(idempotencyKey: idempotencyKey, startedAt: DateTime.now(), request: request));

  /// The server has the alert. Keeps the request only while it is still useful (it is not).
  static Future<void> markDelivered(String alertId, String? controlToken) async {
    final current = await load();
    if (current == null) return;
    await save(SosRecord(
      idempotencyKey: current.idempotencyKey,
      startedAt: current.startedAt,
      alertId: alertId,
      controlToken: controlToken ?? current.controlToken,
    ));
  }

  static Future<void> markResolvePending() async {
    final current = await load();
    if (current?.alertId != null) await save(current!.copyWith(resolvePending: true));
  }

  static Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {}
  }
}
