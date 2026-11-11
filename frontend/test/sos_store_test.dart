import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:devi/services/sos_store.dart';

// L9, L13: the SOS in progress survives the app being closed or killed.

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  final request = {
    'userPhone': '+919876543210',
    'latitude': 13.08,
    'longitude': 80.27,
    'idempotency_key': 'key-1',
    'emergencyContacts': ['+919000000001'],
  };

  test('a pressed SOS is saved as pending with its request', () async {
    await SosStore.savePending(idempotencyKey: 'key-1', request: request);
    final r = await SosStore.load();
    expect(r, isNotNull);
    expect(r!.isPending, isTrue);
    expect(r.idempotencyKey, 'key-1');
    expect(r.request!['latitude'], 13.08);
    expect(r.alertId, isNull);
  });

  test('delivered keeps the alert and its control token, and drops the request', () async {
    await SosStore.savePending(idempotencyKey: 'key-1', request: request);
    await SosStore.markDelivered('alert-1', 'token-1');
    final r = await SosStore.load();
    expect(r!.isPending, isFalse);
    expect(r.alertId, 'alert-1');
    expect(r.controlToken, 'token-1');
    expect(r.idempotencyKey, 'key-1');
    expect(r.request, isNull);
  });

  test('"I am safe" that could not be sent is remembered', () async {
    await SosStore.savePending(idempotencyKey: 'key-1', request: request);
    await SosStore.markDelivered('alert-1', 'token-1');
    await SosStore.markResolvePending();
    final r = await SosStore.load();
    expect(r!.resolvePending, isTrue);
    expect(r.alertId, 'alert-1');
  });

  test('a pending SOS is never marked as "resolve pending": there is nothing to close', () async {
    await SosStore.savePending(idempotencyKey: 'key-1', request: request);
    await SosStore.markResolvePending();
    expect((await SosStore.load())!.resolvePending, isFalse);
  });

  test('clear removes it', () async {
    await SosStore.savePending(idempotencyKey: 'key-1', request: request);
    await SosStore.clear();
    expect(await SosStore.load(), isNull);
  });

  test('an SOS older than a day is dropped, not restored or resent', () async {
    final old = SosRecord(
      idempotencyKey: 'key-old',
      startedAt: DateTime.now().subtract(const Duration(hours: 25)),
      request: request,
    );
    FlutterSecureStorage.setMockInitialValues({'devi_active_sos': jsonEncode(old.toJson())});
    expect(await SosStore.load(), isNull);
  });

  test('broken saved data reads as nothing instead of crashing the app', () async {
    FlutterSecureStorage.setMockInitialValues({'devi_active_sos': '{not json'});
    expect(await SosStore.load(), isNull);
    FlutterSecureStorage.setMockInitialValues({'devi_active_sos': jsonEncode({'at': 'x'})});
    expect(await SosStore.load(), isNull);
  });

  test('marking delivered with nothing saved does nothing', () async {
    await SosStore.markDelivered('alert-1', 'token-1');
    expect(await SosStore.load(), isNull);
  });
}
