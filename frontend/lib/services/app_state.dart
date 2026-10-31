import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'api_service.dart';
import 'emergency_media_service.dart';
import 'onboarding_service.dart';

class GuardianModel {
  final String name;
  final String phone;

  GuardianModel({required this.name, required this.phone});

  Map<String, String> toMap() => {'name': name, 'phone': phone};

  factory GuardianModel.fromMap(Map<String, dynamic> map) {
    return GuardianModel(
      name: map['name']?.toString() ?? '',
      phone: map['phone']?.toString() ?? '',
    );
  }
}

class AppState extends ChangeNotifier {
  static final AppState instance = AppState._internal();

  /// Most guardians a user can have (the server sends SOS WhatsApp to at most this many)
  static const int maxGuardians = 3;
  factory AppState() => instance;
  AppState._internal();

  String name = '';
  String phone = '';
  String address1 = '';
  String address2 = '';
  String? profilePhotoPath;
  bool isGuest = false;
  bool isLoading = false;
  String? activeAlertId;
  bool isEmergencyActive = false;

  // Name + guardian from the first-run quick setup (kept on the device, used by
  // Instant SOS and merged into the account on sign in / pre-filled on sign up)
  String setupName = '';
  final List<GuardianModel> _setupGuardians = [];
  List<GuardianModel> get setupGuardians => List.unmodifiable(_setupGuardians);

  final List<GuardianModel> _guardians = [];

  List<GuardianModel> get rawGuardians => List.unmodifiable(_guardians);

  List<GuardianModel> get guardians => List.unmodifiable(_guardians);

  void setActiveEmergency(String? alertId) {
    activeAlertId = alertId;
    isEmergencyActive = alertId != null;
    notifyListeners();
  }

  void clearActiveEmergency() {
    activeAlertId = null;
    isEmergencyActive = false;
    notifyListeners();
  }

  void setProfilePhoto(String? path) {
    profilePhotoPath = path;
    notifyListeners();
  }

  void setGuestMode(bool guest) {
    isGuest = guest;
    if (guest) {
      initGuestSession();
    }
    notifyListeners();
  }

  void toggleGuestMode() {
    isGuest = !isGuest;
    if (isGuest) {
      initGuestSession();
    }
    notifyListeners();
  }

  // --- Persistent Session Management ---
  static const String _keyLoggedInPhone = 'devi_logged_in_phone';
  static const String _keyIsLoggedIn = 'devi_is_logged_in';
  static const String _keyProfilePhoto = 'devi_profile_photo';
  static const String _keyGuestId = 'devi_guest_id';
  static const String _keyGuestGuardians = 'devi_guest_guardians';
  static const String _keyAuthToken = 'devi_auth_token';
  static const String _keySetupName = 'devi_setup_name';
  // Control tokens of SOS alerts sent as a guest: proof for moving them to the account on sign in
  static const String _keyGuestAlerts = 'devi_guest_alert_tokens';

  // Auth token lives in encrypted storage (Android Keystore / iOS Keychain), not SharedPreferences
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();

  Future<String?> _readAuthToken(SharedPreferences prefs) async {
    final token = await _secureStorage.read(key: _keyAuthToken);
    if (token != null && token.isNotEmpty) return token;

    // One-time migration of tokens saved by older app versions
    final legacyToken = prefs.getString(_keyAuthToken);
    if (legacyToken != null && legacyToken.isNotEmpty) {
      await _secureStorage.write(key: _keyAuthToken, value: legacyToken);
      await prefs.remove(_keyAuthToken);
    }
    return legacyToken;
  }

  // Guest guardians and the quick-setup name are personal data, so they also live in encrypted
  // storage. Values saved by older app versions in SharedPreferences move over on first read.
  Future<String?> _readPrivate(SharedPreferences prefs, String key) async {
    final value = await _secureStorage.read(key: key);
    if (value != null) return value;
    final legacy = prefs.getString(key);
    if (legacy != null) {
      await _secureStorage.write(key: key, value: legacy);
      await prefs.remove(key);
    }
    return legacy;
  }

  Future<void> _writePrivate(SharedPreferences prefs, String key, String value) async {
    await _secureStorage.write(key: key, value: value);
    await prefs.remove(key);
  }

  /// Initializes anonymous guest session with unique ID and syncs to Supabase
  Future<void> initGuestSession() async {
    isGuest = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final guestId = await _ensureGuestId(prefs);
      phone = guestId;
      if (name.isEmpty) name = setupName;

      // Restore locally saved guest guardians if any
      final localGuardiansJson = await _readPrivate(prefs, _keyGuestGuardians);
      if (localGuardiansJson != null && localGuardiansJson.isNotEmpty) {
        final list = jsonDecode(localGuardiansJson) as List<dynamic>?;
        if (list != null && list.isNotEmpty) {
          _guardians.clear();
          for (var item in list) {
            _guardians.add(GuardianModel.fromMap(Map<String, dynamic>.from(item as Map)));
          }
        }
      }

      notifyListeners();

      // Sync guest user with is_guest = true in Supabase
      final guardiansPayload = _guardians.map((g) => g.toMap()).toList();
      await ApiService.instance.syncGuestUser(
        guestId: guestId,
        guardians: guardiansPayload,
      );
    } catch (e) {
      debugPrint('Error initializing guest session: $e');
    }
  }

  /// Random, not time-based: a guest ID must not be guessable. Older time-based IDs
  /// (e.g. GUEST_MVQCFVUF) are replaced; alerts sent with them stay reachable by their tokens.
  Future<String> _ensureGuestId(SharedPreferences prefs) async {
    final saved = prefs.getString(_keyGuestId);
    if (saved != null && RegExp(r'^GUEST_[0-9A-F]{32}$').hasMatch(saved)) return saved;
    final guestId = 'GUEST_${const Uuid().v4().replaceAll('-', '').toUpperCase()}';
    await prefs.setString(_keyGuestId, guestId);
    return guestId;
  }

  Future<void> saveSession(String userPhone, [String? token]) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_keyIsLoggedIn, true);
      await prefs.setString(_keyLoggedInPhone, userPhone);
      if (profilePhotoPath != null) {
        await prefs.setString(_keyProfilePhoto, profilePhotoPath!);
      }
      final tokenToSave = token ?? ApiService.instance.authToken;
      if (tokenToSave != null && tokenToSave.isNotEmpty) {
        await _secureStorage.write(key: _keyAuthToken, value: tokenToSave);
      }
      // Reset any previous emergency media banner for fresh user session
      EmergencyMediaService.instance.reset();
      // Signed in / signed up: the first-run quick setup is no longer needed
      await OnboardingService.markSetupDone();
      await OnboardingService.clearSignInReminder();
    } catch (e) {
      debugPrint('Error saving session: $e');
    }
    await claimGuestAlerts();
  }

  /// Keeps the control token of an SOS sent as a guest, so the alert and its evidence
  /// can move to the account when the user signs in later.
  Future<void> rememberGuestAlert(String alertId) async {
    if (!isGuest) return;
    final token = ApiService.instance.sosControlToken(alertId);
    if (token == null) return;
    try {
      final alerts = await _readGuestAlerts();
      alerts[alertId] = token;
      await _secureStorage.write(key: _keyGuestAlerts, value: jsonEncode(alerts));
    } catch (e) {
      debugPrint('Error saving guest alert: $e');
    }
  }

  /// Alerts sent as a guest on this device (alert ID → control token), for the guest's history
  Future<Map<String, String>> guestAlertTokens() async {
    try {
      return await _readGuestAlerts();
    } catch (e) {
      debugPrint('Error reading guest alerts: $e');
      return {};
    }
  }

  Future<Map<String, String>> _readGuestAlerts() async {
    final json = await _secureStorage.read(key: _keyGuestAlerts);
    if (json == null || json.isEmpty) return {};
    return Map<String, String>.from(jsonDecode(json) as Map);
  }

  /// After sign in: moves the alerts sent as a guest on this device to the account.
  /// Kept on the device when the server cannot be reached, so the next sign in retries.
  Future<void> claimGuestAlerts() async {
    if (isGuest) return;
    try {
      final alerts = await _readGuestAlerts();
      if (alerts.isEmpty) return;
      final ok = await ApiService.instance.claimGuestAlerts(alerts);
      if (ok) await _secureStorage.delete(key: _keyGuestAlerts);
    } catch (e) {
      debugPrint('Error claiming guest alerts: $e');
    }
  }

  Future<void> clearSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_keyIsLoggedIn);
      await prefs.remove(_keyLoggedInPhone);
      await prefs.remove(_keyProfilePhoto);
      await prefs.remove(_keyAuthToken);
      // Signed out: the next launch shows sign in, not the old guest session
      await prefs.remove(_keyGuestId);
      await _secureStorage.delete(key: _keyAuthToken);
    } catch (e) {
      debugPrint('Error clearing session: $e');
    }

    // Reset local state & any active emergency media banners
    ApiService.instance.setAuthToken(null);
    EmergencyMediaService.instance.reset();
    name = '';
    phone = '';
    address1 = '';
    address2 = '';
    profilePhotoPath = null;
    isGuest = false;
    _guardians.clear();
    notifyListeners();
  }

  Future<bool> checkAutoLogin() async {
    await _loadQuickSetup();
    try {
      final prefs = await SharedPreferences.getInstance();
      final isLoggedIn = prefs.getBool(_keyIsLoggedIn) ?? false;
      final savedPhone = prefs.getString(_keyLoggedInPhone);
      final savedPhoto = prefs.getString(_keyProfilePhoto);
      final savedToken = await _readAuthToken(prefs);

      if (savedToken != null && savedToken.isNotEmpty) {
        ApiService.instance.setAuthToken(savedToken);
      }

      if (savedPhoto != null && savedPhoto.isNotEmpty) {
        profilePhotoPath = savedPhoto;
      }

      if (isLoggedIn && savedPhone != null && savedPhone.isNotEmpty) {
        phone = savedPhone;
        // Load latest profile from backend
        await loadUserProfile(savedPhone);
        return true;
      } else {
        // Restore guest session and local guardians if app was used in guest mode
        if (prefs.getString(_keyGuestId)?.isNotEmpty ?? false) {
          phone = await _ensureGuestId(prefs);
          isGuest = true;
          if (name.isEmpty) name = setupName;
          final localG = await _readPrivate(prefs, _keyGuestGuardians);
          if (localG != null && localG.isNotEmpty) {
            final list = jsonDecode(localG) as List<dynamic>?;
            if (list != null && list.isNotEmpty) {
              _guardians.clear();
              for (var item in list) {
                _guardians.add(GuardianModel.fromMap(Map<String, dynamic>.from(item as Map)));
              }
            }
          }
        }
      }
    } catch (e) {
      debugPrint('Error checking auto-login: $e');
    }
    return false;
  }

  // --- Dynamic Backend Sync: Load User Profile ---
  Future<void> loadUserProfile(String userPhone) async {
    if (userPhone.isEmpty) return;
    isLoading = true;
    notifyListeners();

    try {
      final data = await ApiService.instance.getProfile(userPhone);
      if (data != null) {
        phone = data['phone'] ?? userPhone;
        name = data['name'] ?? '';
        address1 = data['address1'] ?? '';
        address2 = data['address2'] ?? '';
        
        final list = data['guardians'] as List<dynamic>?;
        if (list != null) {
          _guardians.clear();
          for (var item in list) {
            _guardians.add(GuardianModel.fromMap(Map<String, dynamic>.from(item as Map)));
          }
        }
        isGuest = false;
      }
    } catch (e) {
      debugPrint('Error loading user profile: $e');
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  // --- Dynamic Backend Sync: Update Profile ---
  Future<bool> saveProfileToBackend({
    String? newName,
    String? newPhone,
    String? newAddress1,
    String? newAddress2,
    List<GuardianModel>? newGuardians,
  }) async {
    final targetPhone = (newPhone != null && newPhone.isNotEmpty) ? newPhone : phone;
    if (targetPhone.isEmpty) return false;

    isLoading = true;
    notifyListeners();

    try {
      final guardiansPayload = (newGuardians ?? _guardians)
          .map((g) => g.toMap())
          .toList();

      final success = await ApiService.instance.updateProfile(
        phone: targetPhone,
        name: newName ?? name,
        address1: newAddress1 ?? address1,
        address2: newAddress2 ?? address2,
        guardians: guardiansPayload,
      );

      if (success) {
        if (newName != null) name = newName;
        phone = targetPhone;
        if (newAddress1 != null) address1 = newAddress1;
        if (newAddress2 != null) address2 = newAddress2;
        if (newGuardians != null) {
          _guardians.clear();
          _guardians.addAll(newGuardians);
        }
        isGuest = false;
        notifyListeners();
        return true;
      }
    } catch (e) {
      debugPrint('Error saving profile to backend: $e');
    } finally {
      isLoading = false;
      notifyListeners();
    }
    return false;
  }

  // --- First-run quick setup ---
  Future<void> _loadQuickSetup() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      setupName = await _readPrivate(prefs, _keySetupName) ?? '';
      _setupGuardians.clear();
      final json = await _readPrivate(prefs, _keyGuestGuardians);
      if (json != null && json.isNotEmpty) {
        final list = jsonDecode(json) as List<dynamic>?;
        for (final item in list ?? const []) {
          _setupGuardians.add(GuardianModel.fromMap(Map<String, dynamic>.from(item as Map)));
        }
      }
    } catch (e) {
      debugPrint('Error loading quick setup: $e');
    }
  }

  /// Saves the quick-setup name and guardian on the device. The guardian goes first in
  /// the device guardian list, which Instant SOS (guest mode) uses.
  Future<void> saveQuickSetup({required String name, required GuardianModel guardian}) async {
    setupName = name;
    final merged = <GuardianModel>[guardian];
    for (final g in _setupGuardians) {
      if (g.phone != guardian.phone) merged.add(g);
    }
    _setupGuardians
      ..clear()
      ..addAll(merged);
    try {
      final prefs = await SharedPreferences.getInstance();
      await _writePrivate(prefs, _keySetupName, name);
      await _writePrivate(prefs, _keyGuestGuardians, jsonEncode(merged.map((g) => g.toMap()).toList()));
    } catch (e) {
      debugPrint('Error saving quick setup: $e');
    }
    notifyListeners();
  }

  /// After sign in: add quick-setup guardians the account does not have yet (max [maxGuardians] total)
  Future<void> mergeSetupGuardiansIntoAccount() async {
    if (_setupGuardians.isEmpty || isGuest || phone.isEmpty) return;
    final merged = List<GuardianModel>.from(_guardians);
    var changed = false;
    for (final g in _setupGuardians) {
      if (merged.length >= maxGuardians) break;
      if (g.phone == phone) continue; // never the user's own number
      if (merged.any((m) => m.phone == g.phone)) continue;
      merged.add(g);
      changed = true;
    }
    if (changed) {
      await saveProfileToBackend(newGuardians: merged);
    }
  }

  void addGuardian(String name, String phone) {
    if (_guardians.length >= maxGuardians) return;
    _guardians.add(GuardianModel(name: name, phone: phone));
    notifyListeners();
    _autoSyncGuardians();
  }

  void removeGuardian(int index) {
    if (index >= 0 && index < _guardians.length) {
      _guardians.removeAt(index);
      notifyListeners();
      _autoSyncGuardians();
    }
  }

  void setGuardians(List<GuardianModel> list) {
    _guardians.clear();
    _guardians.addAll(list);
    notifyListeners();
    _autoSyncGuardians();
  }

  void _autoSyncGuardians() async {
    if (isGuest && phone.isNotEmpty) {
      // 1. Save guest guardians on the device (encrypted storage) so they never vanish on app restart
      try {
        final prefs = await SharedPreferences.getInstance();
        final list = _guardians.map((g) => g.toMap()).toList();
        await _writePrivate(prefs, _keyGuestGuardians, jsonEncode(list));
      } catch (e) {
        debugPrint('Error saving guest guardians locally: $e');
      }

      // 2. Sync to Supabase in background
      final guardiansPayload = _guardians.map((g) => g.toMap()).toList();
      ApiService.instance.syncGuestUser(
        guestId: phone,
        guardians: guardiansPayload,
      );
    } else if (phone.isNotEmpty && !isGuest) {
      saveProfileToBackend();
    }
  }

  void updateProfile({
    String? newName,
    String? newPhone,
    String? newAddress1,
    String? newAddress2,
    List<GuardianModel>? newGuardians,
  }) {
    if (newName != null && newName.isNotEmpty) name = newName;
    if (newPhone != null && newPhone.isNotEmpty) phone = newPhone;
    if (newAddress1 != null && newAddress1.isNotEmpty) address1 = newAddress1;
    if (newAddress2 != null && newAddress2.isNotEmpty) address2 = newAddress2;
    if (newGuardians != null && newGuardians.isNotEmpty) {
      _guardians.clear();
      _guardians.addAll(newGuardians);
    }
    isGuest = false;
    notifyListeners();
    _autoSyncGuardians();
  }
}
