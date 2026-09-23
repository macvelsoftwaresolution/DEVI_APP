import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ApiService {
  static final ApiService instance = ApiService._internal();
  factory ApiService() => instance;
  ApiService._internal();

  // Dynamic baseUrl depending on platform
  static String get baseUrl {
    if (kIsWeb) {
      return 'http://localhost:5000/api';
    } else if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:5000/api';
    } else {
      return 'http://localhost:5000/api';
    }
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
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'phone': phone}),
          )
          .timeout(const Duration(seconds: 8));

      final body = jsonDecode(res.body);
      if (res.statusCode == 200 && body['success'] == true) {
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

  // --- User: Get Profile & Guardians ---
  Future<Map<String, dynamic>?> getProfile(String phone) async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/user/profile/$phone'))
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
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 8));

      return res.statusCode == 200;
    } catch (e) {
      debugPrint('API Update Profile Error: $e');
      return false;
    }
  }

  // --- SOS: Trigger Emergency ---
  Future<Map<String, dynamic>?> triggerEmergencyAlert({
    required String userPhone,
    required String location,
    double? latitude,
    double? longitude,
    required List<String> contactsAlerted,
  }) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/sos/trigger'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'userPhone': userPhone,
              'location': location,
              'latitude': latitude ?? 13.0827,
              'longitude': longitude ?? 80.2707,
              'contactsAlerted': contactsAlerted,
            }),
          )
          .timeout(const Duration(seconds: 8));

      if (res.statusCode == 201 || res.statusCode == 200) {
        final body = jsonDecode(res.body);
        return body['data'];
      }
    } catch (e) {
      debugPrint('API SOS Trigger Error: $e');
    }
    return null;
  }

  // --- SOS: Get Emergency History ---
  Future<List<Map<String, dynamic>>> getHistory([String? userPhone]) async {
    try {
      final url = (userPhone != null && userPhone.isNotEmpty)
          ? '$baseUrl/sos/history/$userPhone'
          : '$baseUrl/sos/history';

      final res = await http
          .get(Uri.parse(url))
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
}
