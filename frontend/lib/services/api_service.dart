import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../utils/phone_utils.dart';

class ApiService {
  static final ApiService instance = ApiService._internal();
  factory ApiService() => instance;
  ApiService._internal();

  // Live Hostinger VPS Server Subdomain (DEVI Safe Network)
  static const String liveServerUrl = 'https://devi-api.macvelsoftware.com/api';

  // Local development backend URLs (Port 5005)
  static const String localWebUrl = 'http://localhost:5005/api';
  static const String localAndroidEmulatorUrl = 'http://10.0.2.2:5005/api';

  // Command-line override: flutter run --dart-define=SERVER=live or --dart-define=SERVER=local
  static const String _envOverride = String.fromEnvironment('SERVER', defaultValue: '');

  // Manual runtime toggle (optional, null by default)
  static bool? manualLocalOverride;

  /// Returns true if targeting local development, false if targeting live VPS
  static bool get isLocal {
    if (manualLocalOverride != null) return manualLocalOverride!;
    if (_envOverride.toLowerCase() == 'local') return true;
    if (_envOverride.toLowerCase() == 'live') return false;
    // On Web in debug mode, connect to localhost:5005. On real mobile devices, use live VPS server.
    if (kIsWeb && kDebugMode) return true;
    return false;
  }

  // Active JWT Auth Token
  String? _authToken;

  void setAuthToken(String? token) {
    _authToken = token;
  }

  String? get authToken => _authToken;

  // Error message from the last failed profile save (shown to the user)
  String? lastProfileError;

  // Per-alert control tokens from /sos/trigger. Only this device can resolve the alert
  // or attach evidence.
  final Map<String, String> _sosControlTokens = {};

  String? sosControlToken(String alertId) => _sosControlTokens[alertId];

  Map<String, String> _sosHeaders(String alertId) {
    final headers = Map<String, String>.from(_headers);
    final token = _sosControlTokens[alertId];
    if (token != null) headers['X-SOS-Token'] = token;
    return headers;
  }

  // Base URL for all API requests
  static String get baseUrl {
    if (isLocal) {
      if (kIsWeb) return localWebUrl;
      if (defaultTargetPlatform == TargetPlatform.android) {
        return localAndroidEmulatorUrl;
      }
      return localWebUrl;
    }
    return liveServerUrl;
  }

  /// WebSocket URL for ultra-low bandwidth real-time stream (/ws)
  static String get wsUrl {
    final base = baseUrl;
    String ws = base.startsWith('https://')
        ? base.replaceFirst('https://', 'wss://')
        : base.replaceFirst('http://', 'ws://');
    if (ws.endsWith('/api')) {
      ws = ws.substring(0, ws.length - 4);
    }
    return '$ws/ws';
  }

  // Common authenticated headers
  Map<String, String> get _headers {
    final headers = {'Content-Type': 'application/json'};
    if (_authToken != null && _authToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  // --- Countries open on the server. Offline the app keeps the ones it has. ---
  Future<void> loadAllowedCountries() async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/user/countries'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return;
      final data = jsonDecode(res.body)['data'];
      final countries = data?['countries'];
      if (countries is List && countries.isNotEmpty) {
        PhoneUtils.allowedCountries = countries.map((c) => c.toString()).toList();
      }
      final guest = data?['guestCountries'];
      if (guest is List && guest.isNotEmpty) {
        PhoneUtils.guestCountries = guest.map((c) => c.toString()).toList();
      }
    } catch (e) {
      debugPrint('Could not load allowed countries: $e');
    }
  }

  // --- Auth: WhatsApp code, purpose 'login' or 'signup' ---
  Future<Map<String, dynamic>> sendOtp(String phone, String purpose) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/auth/otp/send'),
            headers: _headers,
            body: jsonEncode({'phone': phone, 'purpose': purpose}),
          )
          .timeout(const Duration(seconds: 15));
      final body = jsonDecode(res.body);
      return {
        'success': res.statusCode == 200 && body['success'] == true,
        'message': body['message'] ?? 'Could not send the code. Please try again.',
      };
    } catch (e) {
      debugPrint('API Send OTP Error: $e');
      return {
        'success': false,
        'message': 'Unable to reach server. Please ensure backend is running.',
      };
    }
  }

  // --- Auth: Login by Mobile and WhatsApp code ---
  Future<Map<String, dynamic>> login(String phone, String otp) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/auth/login'),
            headers: _headers,
            body: jsonEncode({'phone': phone, 'otp': otp}),
          )
          .timeout(const Duration(seconds: 8));

      final body = jsonDecode(res.body);
      if (res.statusCode == 200 && body['success'] == true) {
        // Cache the cryptographically signed JWT token
        final token = body['data']?['token'];
        if (token != null && token is String) {
          setAuthToken(token);
        }
        return {'success': true, 'data': body['data']};
      } else {
        return {
          'success': false,
          'message': body['message'] ?? 'Could not sign in. Please try again.',
        };
      }
    } catch (e) {
      debugPrint('API Login Error: $e');
      return {
        'success': false,
        'message': 'Unable to reach server. Please ensure backend is running.',
      };
    }
  }

  // --- Account: delete the account, its guardians and SOS history. Needs a WhatsApp code
  // (sendOtp(phone, 'login')). Returns null when deleted, else the message to show. ---
  Future<String?> deleteAccount(String phone, String otp) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/auth/account/delete'),
            headers: _headers,
            body: jsonEncode({'phone': phone, 'otp': otp}),
          )
          .timeout(const Duration(seconds: 20));
      final body = jsonDecode(res.body);
      if (res.statusCode == 200 && body['success'] == true) return null;
      return body['message'] ?? 'Could not delete your account. Please try again.';
    } catch (e) {
      debugPrint('API Delete Account Error: $e');
      return 'Unable to reach server. Please check your internet and try again.';
    }
  }

  // --- Auth: Fresh token for a saved session. True: renewed. False: the server refused it,
  // the user must sign in again. Null: server not reached, so the saved session stays. ---
  Future<bool?> refreshSession() async {
    try {
      final res = await http
          .post(Uri.parse('$baseUrl/auth/refresh'), headers: _headers)
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 401 || res.statusCode == 403) return false;
      if (res.statusCode != 200) return null;
      final token = jsonDecode(res.body)['data']?['token'];
      if (token is! String) return null;
      setAuthToken(token);
      return true;
    } catch (e) {
      debugPrint('API Refresh Session Error: $e');
      return null;
    }
  }

  // --- User: Get Profile & Guardians ---
  Future<Map<String, dynamic>?> getProfile(String phone) async {
    try {
      final res = await http
          .get(
            Uri.parse('$baseUrl/user/profile/${Uri.encodeComponent(phone)}'),
            headers: _headers,
          )
          .timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body);
        return body['data'];
      }
    } catch (e) {
      debugPrint('API Get Profile Error: $e');
    }
    return null;
  }

  // --- User: Update Profile ---
  Future<bool> updateProfile({
    required String phone,
    String? name,
    String? address1,
    String? address2,
    List<Map<String, String>>? guardians,
    String? otp,
  }) async {
    try {
      final payload = <String, dynamic>{
        'phone': phone,
        'otp': ?otp,
        'name': ?name,
        'address1': ?address1,
        'address2': ?address2,
        'guardians': ?guardians,
      };

      final res = await http
          .put(
            Uri.parse('$baseUrl/user/profile'),
            headers: _headers,
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 8));

      final body = jsonDecode(res.body);
      if (res.statusCode == 200) {
        lastProfileError = null;
        // First-time sign up returns a session token
        final token = body['token'];
        if (token != null && token is String) {
          setAuthToken(token);
        }
        return true;
      }
      lastProfileError = body['message']?.toString();
      return false;
    } catch (e) {
      debugPrint('API Update Profile Error: $e');
      lastProfileError = 'Unable to reach server. Please try again.';
      return false;
    }
  }

  // --- Guest: Sync Anonymous Guest User in Supabase ---
  Future<Map<String, dynamic>?> syncGuestUser({
    required String guestId,
    List<Map<String, String>>? guardians,
  }) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/user/guest'),
            headers: _headers,
            body: jsonEncode({
              'guestId': guestId,
              'guardians': ?guardians,
            }),
          )
          .timeout(const Duration(seconds: 8));

      if (res.statusCode == 200 || res.statusCode == 201) {
        final body = jsonDecode(res.body);
        return body['data'];
      }
    } catch (e) {
      debugPrint('API Guest Sync Error: $e');
    }
    return null;
  }

  // A control token kept on the phone (sos_store.dart), back in memory after a restart
  void rememberControlToken(String alertId, String token) {
    _sosControlTokens[alertId] = token;
  }

  // --- SOS: the body of POST /sos/trigger. Saved as is (sos_store.dart) so a resend after a
  // restart or from the background task is the same request, with the same idempotency key.
  static Map<String, dynamic> sosPayload({
    required String userPhone,
    String? userName,
    required String location,
    double? latitude,
    double? longitude,
    double? accuracy,
    String? idempotencyKey,
    DateTime? capturedAt,
    required List<String> contactsAlerted,
    List<String>? emergencyContacts,
  }) =>
      <String, dynamic>{
        'userPhone': userPhone,
        'userName': userName,
        'location': location,
        // null when GPS is unavailable; the server marks the alert "location pending"
        // and live tracking fills it in. Never send a made-up default location.
        'latitude': latitude,
        'longitude': longitude,
        'accuracy': accuracy,
        'idempotency_key': idempotencyKey,
        'captured_at': capturedAt?.toIso8601String(),
        'contactsAlerted': contactsAlerted,
        'emergencyContacts': emergencyContacts ?? contactsAlerted,
      };

  // --- SOS: Trigger Emergency ---
  Future<Map<String, dynamic>?> triggerEmergencyAlert({
    required String userPhone,
    String? userName,
    required String location,
    double? latitude,
    double? longitude,
    double? accuracy,
    String? idempotencyKey,
    DateTime? capturedAt,
    required List<String> contactsAlerted,
    List<String>? emergencyContacts,
  }) =>
      sendSosPayload(sosPayload(
        userPhone: userPhone,
        userName: userName,
        location: location,
        latitude: latitude,
        longitude: longitude,
        accuracy: accuracy,
        idempotencyKey: idempotencyKey,
        capturedAt: capturedAt,
        contactsAlerted: contactsAlerted,
        emergencyContacts: emergencyContacts,
      ));

  /// Sends a prepared SOS body. Returns the alert data, or null when the server was not reached.
  Future<Map<String, dynamic>?> sendSosPayload(Map<String, dynamic> payload) async {
    try {
      // Sent over HTTPS; sensitive fields are encrypted at rest by the server
      final res = await http
          .post(
            Uri.parse('$baseUrl/sos/trigger'),
            headers: _headers,
            body: jsonEncode(payload),
          )
          // Server waits up to 5s for WhatsApp before replying, so allow more than other calls
          .timeout(const Duration(seconds: 12));

      if (res.statusCode == 201 || res.statusCode == 200) {
        final body = jsonDecode(res.body);
        final data = body['data'] is Map<String, dynamic>
            ? Map<String, dynamic>.from(body['data'])
            : <String, dynamic>{};
        data['duplicate'] = body['duplicate'] == true;
        final alertId = data['id']?.toString();
        final controlToken = data['controlToken'];
        if (alertId != null && controlToken is String) {
          _sosControlTokens[alertId] = controlToken;
        }
        return data;
      }
    } catch (e) {
      debugPrint('API SOS Trigger Error: $e');
    }
    return null;
  }

  // --- SOS: Resolve / Deactivate Alert ---
  Future<bool> resolveEmergencyAlert(String alertId) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/sos/resolve/$alertId'),
            headers: _sosHeaders(alertId),
          )
          .timeout(const Duration(seconds: 5));

      // Token is kept: the evidence upload can still finish after the alert is resolved
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('API SOS Resolve Error: $e');
      return false;
    }
  }

  // --- SOS: Move alerts sent as a guest to the signed-in account ---
  // [alerts] maps alert ID → control token. True when the server answered (claimed or not).
  Future<bool> claimGuestAlerts(Map<String, String> alerts) async {
    if (_authToken == null || alerts.isEmpty) return false;
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/sos/claim'),
            headers: _headers,
            body: jsonEncode({
              'alerts': alerts.entries
                  .map((e) => {'alertId': e.key, 'controlToken': e.value})
                  .toList(),
            }),
          )
          .timeout(const Duration(seconds: 8));
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('API Claim Guest Alerts Error: $e');
      return false;
    }
  }

  // --- SOS: Guest history (no login: each alert is proven with its control token) ---
  Future<List<Map<String, dynamic>>> getGuestHistory(Map<String, String> alerts) async {
    if (alerts.isEmpty) return [];
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/sos/history/guest'),
            headers: _headers,
            body: jsonEncode({
              'alerts': alerts.entries
                  .map((e) => {'alertId': e.key, 'controlToken': e.value})
                  .toList(),
            }),
          )
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final list = jsonDecode(res.body)['data'] as List<dynamic>?;
        return (list ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
    } catch (e) {
      debugPrint('API Guest History Error: $e');
    }
    return [];
  }

  // --- SOS: Get Emergency History ---
  Future<List<Map<String, dynamic>>> getHistory([String? userPhone]) async {
    try {
      final url = (userPhone != null && userPhone.isNotEmpty)
          ? '$baseUrl/sos/history/${Uri.encodeComponent(userPhone)}'
          : '$baseUrl/sos/history';

      final res = await http
          .get(Uri.parse(url), headers: _headers)
          .timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body);
        final list = body['data'] as List<dynamic>?;
        if (list != null) {
          return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        }
      }
    } catch (e) {
      debugPrint('API SOS History Error: $e');
    }
    return [];
  }

  // --- SOS: Upload 2-Minute Audio/Video Evidence to Cloudinary ---
  Future<String?> uploadEmergencyEvidence({
    required String alertId,
    List<int>? fileBytes,
    String? filePath,
    String fileName = 'emergency_evidence.mp4',
  }) async {
    try {
      final uri = Uri.parse('$baseUrl/sos/upload-evidence');
      final request = http.MultipartRequest('POST', uri);
      request.fields['alertId'] = alertId;

      if (_authToken != null && _authToken!.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer $_authToken';
      }
      // The server checks these headers before it reads the file, so the alert ID goes in a header too
      request.headers['X-Alert-Id'] = alertId;
      final controlToken = _sosControlTokens[alertId];
      if (controlToken != null) {
        request.headers['X-SOS-Token'] = controlToken;
      }

      if (fileBytes != null && fileBytes.isNotEmpty) {
        request.files.add(
          http.MultipartFile.fromBytes(
            'file',
            fileBytes,
            filename: fileName,
          ),
        );
      } else if (filePath != null && filePath.isNotEmpty) {
        request.files.add(
          await http.MultipartFile.fromPath(
            'file',
            filePath,
            filename: fileName,
          ),
        );
      } else {
        debugPrint('uploadEmergencyEvidence: No file data provided');
        return null;
      }

      // A 2-minute video is ~35 MB: on mobile data the upload plus the server's own upload to
      // Cloudinary takes well over 30 seconds, so allow up to 5 minutes before giving up
      final streamedResponse = await request.send().timeout(const Duration(minutes: 5));
      final res = await http.Response.fromStream(streamedResponse);

      if (res.statusCode == 200 || res.statusCode == 201) {
        final body = jsonDecode(res.body);
        final evidenceUrl = body['data']?['evidenceUrl'];
        debugPrint('Emergency evidence uploaded to Cloudinary: $evidenceUrl');
        return evidenceUrl?.toString();
      } else {
        debugPrint('Upload evidence failed with status ${res.statusCode}: ${res.body}');
      }
    } catch (e) {
      debugPrint('API Upload Emergency Evidence Error: $e');
    }
    return null;
  }
}
