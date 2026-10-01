import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'encryption_service.dart';

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

  // --- Check API Server Health ---
  Future<bool> checkHealth() async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/health'))
          .timeout(const Duration(seconds: 5));
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('API Health Check Error: $e');
      return false;
    }
  }

  // --- Auth: Login by Mobile ---
  Future<Map<String, dynamic>> login(String phone) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/auth/login'),
            headers: _headers,
            body: jsonEncode({'phone': phone}),
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
          'message': body['message'] ?? 'This mobile number is not registered. Please sign up first.',
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

  // --- Auth: Verify active JWT token ---
  Future<bool> verifyToken() async {
    if (_authToken == null || _authToken!.isEmpty) return false;
    try {
      final res = await http
          .get(
            Uri.parse('$baseUrl/auth/verify'),
            headers: _headers,
          )
          .timeout(const Duration(seconds: 5));
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('Token verification error: $e');
      return false;
    }
  }

  // --- User: Get Profile & Guardians ---
  Future<Map<String, dynamic>?> getProfile(String phone) async {
    try {
      final res = await http
          .get(
            Uri.parse('$baseUrl/user/profile/$phone'),
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
  }) async {
    try {
      final payload = <String, dynamic>{
        'phone': phone,
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

      return res.statusCode == 200;
    } catch (e) {
      debugPrint('API Update Profile Error: $e');
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
  }) async {
    try {
      final payload = <String, dynamic>{
        'userPhone': userPhone,
        'userName': userName,
        'location': location,
        'latitude': latitude ?? 13.0827,
        'longitude': longitude ?? 80.2707,
        'accuracy': accuracy,
        'idempotency_key': idempotencyKey,
        'captured_at': capturedAt?.toIso8601String(),
        'contactsAlerted': contactsAlerted,
        'emergencyContacts': emergencyContacts ?? contactsAlerted,
      };

      // Encrypt payload with AES-256
      final encryptedToken = EncryptionService.instance.encryptJson(payload);

      final res = await http
          .post(
            Uri.parse('$baseUrl/sos/trigger'),
            headers: _headers,
            body: jsonEncode({
              ...payload,
              'encrypted': encryptedToken,
            }),
          )
          .timeout(const Duration(seconds: 8));

      if (res.statusCode == 201 || res.statusCode == 200) {
        final body = jsonDecode(res.body);
        final data = body['data'] is Map<String, dynamic>
            ? Map<String, dynamic>.from(body['data'])
            : <String, dynamic>{};
        data['duplicate'] = body['duplicate'] == true;
        return data;
      }
    } catch (e) {
      debugPrint('API SOS Trigger Error: $e');
    }
    return null;
  }

  // --- SOS: Push Real-Time Live Location Update ---
  Future<bool> updateLiveLocation({
    required String alertId,
    required double latitude,
    required double longitude,
    String? address,
    String status = 'ACTIVE',
  }) async {
    try {
      final payload = <String, dynamic>{
        'alertId': alertId,
        'latitude': latitude,
        'longitude': longitude,
        'address': address,
        'status': status,
      };

      // Encrypt live coordinates with AES-256
      final encryptedToken = EncryptionService.instance.encryptJson(payload);

      final res = await http
          .post(
            Uri.parse('$baseUrl/sos/live-update'),
            headers: _headers,
            body: jsonEncode({
              ...payload,
              'encrypted': encryptedToken,
            }),
          )
          .timeout(const Duration(seconds: 5));

      return res.statusCode == 200;
    } catch (e) {
      debugPrint('API Live Location Update Error: $e');
      return false;
    }
  }

  // --- SOS: Resolve / Deactivate Alert ---
  Future<bool> resolveEmergencyAlert(String alertId) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/sos/resolve/$alertId'),
            headers: _headers,
          )
          .timeout(const Duration(seconds: 5));

      return res.statusCode == 200;
    } catch (e) {
      debugPrint('API SOS Resolve Error: $e');
      return false;
    }
  }

  // --- SOS: Get Emergency History ---
  Future<List<Map<String, dynamic>>> getHistory([String? userPhone]) async {
    try {
      final url = (userPhone != null && userPhone.isNotEmpty)
          ? '$baseUrl/sos/history/$userPhone'
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

      final streamedResponse = await request.send().timeout(const Duration(seconds: 30));
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
