import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

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
  factory AppState() => instance;
  AppState._internal();

  String name = '';
  String phone = '';
  String address1 = '';
  String address2 = '';
  String? profilePhotoPath;
  bool isGuest = false;
  bool isLoading = false;

  final List<GuardianModel> _guardians = [];

  List<GuardianModel> get rawGuardians => List.unmodifiable(_guardians);

  List<GuardianModel> get guardians => List.unmodifiable(_guardians);

  void setProfilePhoto(String? path) {
    profilePhotoPath = path;
    notifyListeners();
  }

  void setGuestMode(bool guest) {
    isGuest = guest;
    notifyListeners();
  }

  void toggleGuestMode() {
    isGuest = !isGuest;
    notifyListeners();
  }

  // --- Persistent Session Management ---
  static const String _keyLoggedInPhone = 'devi_logged_in_phone';
  static const String _keyIsLoggedIn = 'devi_is_logged_in';
  static const String _keyProfilePhoto = 'devi_profile_photo';

  Future<void> saveSession(String userPhone) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_keyIsLoggedIn, true);
      await prefs.setString(_keyLoggedInPhone, userPhone);
      if (profilePhotoPath != null) {
        await prefs.setString(_keyProfilePhoto, profilePhotoPath!);
      }
    } catch (e) {
      debugPrint('Error saving session: $e');
    }
  }

  Future<void> clearSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_keyIsLoggedIn);
      await prefs.remove(_keyLoggedInPhone);
      await prefs.remove(_keyProfilePhoto);
    } catch (e) {
      debugPrint('Error clearing session: $e');
    }

    // Reset local state
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
    try {
      final prefs = await SharedPreferences.getInstance();
      final isLoggedIn = prefs.getBool(_keyIsLoggedIn) ?? false;
      final savedPhone = prefs.getString(_keyLoggedInPhone);
      final savedPhoto = prefs.getString(_keyProfilePhoto);

      if (savedPhoto != null && savedPhoto.isNotEmpty) {
        profilePhotoPath = savedPhoto;
      }

      if (isLoggedIn && savedPhone != null && savedPhone.isNotEmpty) {
        phone = savedPhone;
        // Load latest profile from backend
        await loadUserProfile(savedPhone);
        return true;
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

  void addGuardian(String name, String phone) {
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

  void _autoSyncGuardians() {
    if (phone.isNotEmpty && !isGuest) {
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
