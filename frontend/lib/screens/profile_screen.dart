import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../theme/app_colors.dart';
import '../widgets/input_field.dart';
import '../widgets/devi_button.dart';
import '../widgets/devi_logo.dart';
import 'sos_screen.dart';

class _ContactSuggestion {
  final String name;
  final String phoneNumber; // 10-digit clean phone number
  final String rawNumber;

  const _ContactSuggestion({
    required this.name,
    required this.phoneNumber,
    required this.rawNumber,
  });
}

class ProfileScreen extends StatefulWidget {
  final bool isEditing;
  const ProfileScreen({super.key, this.isEditing = false});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final TextEditingController _nameController;
  late final TextEditingController _phoneController;
  late final TextEditingController _address1Controller;
  late final List<TextEditingController> _guardianNameControllers;
  late final List<TextEditingController> _guardianPhoneControllers;

  String? _selectedPhotoPath;
  String? _nameError;
  String? _phoneError;
  String? _address1Error;
  List<String?> _guardianNameErrors = [];
  List<String?> _guardianPhoneErrors = [];
  bool _isSaving = false;

  List<_ContactSuggestion> _allContactSuggestions = [];
  List<_ContactSuggestion> _filteredSuggestions = [];
  int? _activeSuggestionGuardianIndex; // 0, 1, 2... for guardian slots only
  bool _isLoadingContacts = false;
  bool _hasRequestedContactsPermission = false;

  @override
  void initState() {
    super.initState();
    // Warm up contacts cache in background if permission is already granted
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        final hasPerm = await FlutterContacts.permissions.has(PermissionType.read);
        if (hasPerm) {
          _initContacts();
        }
      } catch (_) {}
    });

    final state = AppState.instance;
    _selectedPhotoPath = widget.isEditing ? state.profilePhotoPath : null;
    // If registered user is editing profile from settings, show current values
    final isEditing = widget.isEditing && state.name.isNotEmpty && !state.isGuest;
    _nameController = TextEditingController(
      text: isEditing ? state.name : (widget.isEditing ? '' : state.setupName),
    );
    _phoneController = TextEditingController(text: isEditing ? state.phone : '');
    _address1Controller = TextEditingController(text: isEditing ? state.address1 : '');

    final existingGuardians = state.rawGuardians;
    if (isEditing && existingGuardians.isNotEmpty) {
      _guardianNameControllers = existingGuardians
          .map((g) => TextEditingController(text: g.name))
          .toList();
      _guardianPhoneControllers = existingGuardians
          .map((g) => TextEditingController(text: g.phone))
          .toList();
    } else if (!widget.isEditing && state.setupGuardians.isNotEmpty) {
      // Sign up after first-run quick setup: start from the guardians already entered
      _guardianNameControllers = state.setupGuardians
          .map((g) => TextEditingController(text: g.name))
          .toList();
      _guardianPhoneControllers = state.setupGuardians
          .map((g) => TextEditingController(text: g.phone))
          .toList();
    } else {
      _guardianNameControllers = [
        TextEditingController(),
      ];
      _guardianPhoneControllers = [
        TextEditingController(),
      ];
    }
    if (_guardianPhoneControllers.isEmpty) {
      _guardianNameControllers.add(TextEditingController());
      _guardianPhoneControllers.add(TextEditingController());
    }
    _guardianNameErrors = List.filled(_guardianPhoneControllers.length, null, growable: true);
    _guardianPhoneErrors = List.filled(_guardianPhoneControllers.length, null, growable: true);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _address1Controller.dispose();
    for (var controller in _guardianNameControllers) {
      controller.dispose();
    }
    for (var controller in _guardianPhoneControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  void _addGuardian() {
    if (_guardianPhoneControllers.length < AppState.maxGuardians) {
      setState(() {
        _guardianNameControllers.add(TextEditingController());
        _guardianPhoneControllers.add(TextEditingController());
        _guardianNameErrors.add(null);
        _guardianPhoneErrors.add(null);
      });
    } else {
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.primaryNavy,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          content: const Text(
            'You can add up to ${AppState.maxGuardians} guardians only',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  void _removeGuardian(int index) {
    if (index > 0 && index < _guardianPhoneControllers.length) {
      setState(() {
        _guardianNameControllers[index].dispose();
        _guardianPhoneControllers[index].dispose();
        _guardianNameControllers.removeAt(index);
        _guardianPhoneControllers.removeAt(index);
        _guardianNameErrors.removeAt(index);
        _guardianPhoneErrors.removeAt(index);
      });
    }
  }

  Future<String> _persistImageLocally(XFile pickedFile) async {
    try {
      if (!kIsWeb) {
        // Try local assets/images directory if available (desktop/dev environment)
        final assetsDir = Directory('assets/images');
        if (await assetsDir.exists()) {
          final ext = pickedFile.name.contains('.') ? pickedFile.name.split('.').last : 'jpg';
          final targetPath = 'assets/images/user_profile_${DateTime.now().millisecondsSinceEpoch}.$ext';
          final file = File(pickedFile.path);
          final copied = await file.copy(targetPath);
          return copied.path;
        }

        // Also support saving alongside the picked file with persistent name
        final sourceFile = File(pickedFile.path);
        final parentDir = sourceFile.parent;
        final persistentFile = File('${parentDir.path}/devi_user_profile.jpg');
        await sourceFile.copy(persistentFile.path);
        return persistentFile.path;
      }
    } catch (e) {
      debugPrint('Error saving local profile image: $e');
    }
    return pickedFile.path;
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final XFile? image = await picker.pickImage(
        source: source,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );

      if (image == null) return;

      final savedPath = await _persistImageLocally(image);
      setState(() {
        _selectedPhotoPath = savedPath;
      });
      AppState.instance.setProfilePhoto(savedPath);

      _showToast('Profile photo updated successfully!');
    } catch (e) {
      debugPrint('Error picking image: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load image: $e'),
            backgroundColor: AppColors.emergencyRed,
          ),
        );
      }
    }
  }

  void _showToast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.primaryNavy,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  void _showPhotoOptionsModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(ctx).size.height * 0.85,
        ),
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 38,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const Text(
                  'Profile Photo',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primaryNavy,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Upload your photo so the safety desk can recognize you',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: 12),
                ListTile(
                  dense: true,
                  visualDensity: const VisualDensity(horizontal: 0, vertical: -2),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.primaryNavy.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.camera_alt_outlined, color: AppColors.primaryNavy, size: 20),
                  ),
                  title: const Text('Take Photo', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  subtitle: const Text('Use camera to capture photo', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: AppColors.textMuted),
                  onTap: () {
                    Navigator.of(ctx).pop();
                    _pickImage(ImageSource.camera);
                  },
                ),
                const SizedBox(height: 4),
                ListTile(
                  dense: true,
                  visualDensity: const VisualDensity(horizontal: 0, vertical: -2),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.primaryNavy.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.photo_library_outlined, color: AppColors.primaryNavy, size: 20),
                  ),
                  title: const Text('Choose from Gallery', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  subtitle: const Text('Select an image from device gallery', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: AppColors.textMuted),
                  onTap: () {
                    Navigator.of(ctx).pop();
                    _pickImage(ImageSource.gallery);
                  },
                ),
                const SizedBox(height: 4),
                ListTile(
                  dense: true,
                  visualDensity: const VisualDensity(horizontal: 0, vertical: -2),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.image_outlined, color: AppColors.verifiedGreen, size: 20),
                  ),
                  title: const Text('Default Avatar', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  subtitle: const Text('Use default DEVI profile photo', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: AppColors.textMuted),
                  onTap: () {
                    Navigator.of(ctx).pop();
                    setState(() {
                      _selectedPhotoPath = 'assets/images/profile_avatar.jpg';
                    });
                    AppState.instance.setProfilePhoto(_selectedPhotoPath);
                    _showToast('Reset to default avatar');
                  },
                ),
                if (_selectedPhotoPath != null && _selectedPhotoPath != 'assets/images/profile_avatar.jpg') ...[
                  const SizedBox(height: 4),
                  ListTile(
                    dense: true,
                    visualDensity: const VisualDensity(horizontal: 0, vertical: -2),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    leading: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEE2E2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.delete_outline, color: AppColors.emergencyRed, size: 20),
                    ),
                    title: const Text('Remove Photo', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.emergencyRed)),
                    subtitle: const Text('Remove custom uploaded photo', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                    onTap: () {
                      Navigator.of(ctx).pop();
                      setState(() {
                        _selectedPhotoPath = null;
                      });
                      AppState.instance.setProfilePhoto(null);
                      _showToast('Profile photo removed');
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAvatarImage() {
    final photoPath = _selectedPhotoPath;
    if (photoPath != null && photoPath.isNotEmpty) {
      if (photoPath.startsWith('assets/')) {
        return Image.asset(
          photoPath,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) =>
              const Icon(Icons.person, size: 50, color: AppColors.textMuted),
        );
      } else if (kIsWeb) {
        return Image.network(
          photoPath,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) =>
              const Icon(Icons.person, size: 50, color: AppColors.textMuted),
        );
      } else {
        final file = File(photoPath);
        if (file.existsSync()) {
          return Image.file(
            file,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) =>
                const Icon(Icons.person, size: 50, color: AppColors.textMuted),
          );
        }
      }
    }

    return Image.asset(
      'assets/images/profile_avatar.jpg',
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) =>
          const Icon(Icons.person, size: 50, color: AppColors.textMuted),
    );
  }

  Future<void> _onFinish() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final address1 = _address1Controller.text.trim();

    bool hasError = false;

    // 1. Name  Validation
    if (name.isEmpty) {
      _nameError = 'Name is required';
      hasError = true;
    } else if (name.length < 3) {
      _nameError = 'Name must be at least 3 characters';
      hasError = true;
    } else if (!RegExp(r"^[a-zA-Z\s\.]+$").hasMatch(name)) {
      _nameError = 'Name should only contain letters and spaces';
      hasError = true;
    } else {
      _nameError = null;
    }

    // 2. Mobile Number Validation
    if (phone.isEmpty) {
      _phoneError = 'Mobile number is required';
      hasError = true;
    } else if (phone.length != 10) {
      _phoneError = 'Mobile number must be exactly 10 digits';
      hasError = true;
    } else if (!RegExp(r'^[6-9]\d{9}$').hasMatch(phone)) {
      _phoneError = 'Enter a valid number starting with 6, 7, 8, or 9';
      hasError = true;
    } else {
      _phoneError = null;
    }

    // 3. Address 1 Validation (Mandatory)
    if (address1.isEmpty) {
      _address1Error = 'Address is mandatory';
      hasError = true;
    } else if (address1.length < 5) {
      _address1Error = 'Enter complete address (minimum 5 characters)';
      hasError = true;
    } else {
      _address1Error = null;
    }

    // 4. Guardians Validation (Both Name & Phone)
    final List<GuardianModel> newGuardians = [];
    _guardianNameErrors = List.filled(_guardianPhoneControllers.length, null, growable: true);
    _guardianPhoneErrors = List.filled(_guardianPhoneControllers.length, null, growable: true);

    final Set<String> seenPhones = {};
    int validGuardianCount = 0;

    for (int i = 0; i < _guardianPhoneControllers.length; i++) {
      final gName = _guardianNameControllers[i].text.trim();
      final gPhone = _guardianPhoneControllers[i].text.trim();

      // If both name and phone are empty and index > 0, skip optional slot
      if (gName.isEmpty && gPhone.isEmpty) {
        if (i == 0) {
          _guardianPhoneErrors[i] = 'At least 1 guardian is required';
          hasError = true;
        }
        continue;
      }

      // If either name or phone is filled, both become required for this guardian
      if (gName.isEmpty) {
        _guardianNameErrors[i] = 'Guardian name is required';
        hasError = true;
      } else if (gName.length < 2) {
        _guardianNameErrors[i] = 'Name must be at least 2 characters';
        hasError = true;
      }

      if (gPhone.isEmpty) {
        _guardianPhoneErrors[i] = 'Phone number is required';
        hasError = true;
      } else if (gPhone.length != 10) {
        _guardianPhoneErrors[i] = 'Must be exactly 10 digits';
        hasError = true;
      } else if (!RegExp(r'^[6-9]\d{9}$').hasMatch(gPhone)) {
        _guardianPhoneErrors[i] = 'Starts with 6, 7, 8, or 9';
        hasError = true;
      } else if (gPhone == phone) {
        _guardianPhoneErrors[i] = 'Cannot be your own number';
        hasError = true;
      } else if (seenPhones.contains(gPhone)) {
        _guardianPhoneErrors[i] = 'Duplicate guardian number';
        hasError = true;
      }

      if (_guardianNameErrors[i] == null && _guardianPhoneErrors[i] == null) {
        seenPhones.add(gPhone);
        validGuardianCount++;
        newGuardians.add(GuardianModel(name: gName, phone: gPhone));
      }
    }

    if (validGuardianCount == 0) {
      if (_guardianPhoneErrors.isNotEmpty && _guardianPhoneErrors[0] == null) {
        _guardianPhoneErrors[0] = 'At least 1 guardian is required';
      }
      hasError = true;
    }

    if (hasError) {
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please correct the highlighted form errors'),
          backgroundColor: AppColors.emergencyRed,
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    // Dynamically persist to Supabase backend
    final saved = await AppState.instance.saveProfileToBackend(
      newName: name,
      newPhone: phone,
      newAddress1: address1,
      newAddress2: null,
      newGuardians: newGuardians,
    );

    if (!saved) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ApiService.instance.lastProfileError ?? 'Could not save profile. Please try again.',
          ),
          backgroundColor: AppColors.emergencyRed,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 3),
        ),
      );
      return;
    }

    // Persist chosen profile photo locally in AppState
    AppState.instance.setProfilePhoto(_selectedPhotoPath);

    // Save session to SharedPreferences for persistent auto-login
    await AppState.instance.saveSession(phone);

    if (!mounted) return;
    setState(() => _isSaving = false);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          widget.isEditing
              ? 'Profile updated successfully!'
              : 'Registration successful! Welcome to DEVI.',
        ),
        backgroundColor: AppColors.primaryNavy,
        duration: const Duration(seconds: 2),
      ),
    );

    if (widget.isEditing) {
      if (Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      } else {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const SosScreen()),
        );
      }
    } else {
      // Direct entry to main SOS screen for registered user. Never goes back to Login!
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (context) => const SosScreen()),
        (route) => false,
      );
    }
  }

  Future<void> _initContacts() async {
    if (_allContactSuggestions.isNotEmpty || _isLoadingContacts) return;
    _isLoadingContacts = true;
    try {
      final hasPerm = await FlutterContacts.permissions.has(PermissionType.read);
      if (!hasPerm) {
        final status = await FlutterContacts.permissions.request(PermissionType.read);
        if (status != PermissionStatus.granted && status != PermissionStatus.limited) {
          _isLoadingContacts = false;
          return;
        }
      }
      final contacts = await FlutterContacts.getAll(
        properties: {ContactProperty.phone, ContactProperty.name},
      );
      final List<_ContactSuggestion> list = [];
      final Set<String> seen = {};
      for (final c in contacts) {
        final name = (c.displayName ?? '').trim();
        for (final p in c.phones) {
          final clean = _normalizePhone(p.number);
          if (clean.length == 10 && !seen.contains(clean)) {
            seen.add(clean);
            list.add(_ContactSuggestion(
              name: name.isNotEmpty ? name : 'Contact',
              phoneNumber: clean,
              rawNumber: p.number,
            ));
          }
        }
      }
      if (mounted) {
        setState(() {
          _allContactSuggestions = list;
          _isLoadingContacts = false;
        });
      }
    } catch (_) {
      _isLoadingContacts = false;
    }
  }

  String _normalizePhone(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 12 && digits.startsWith('91')) {
      return digits.substring(2);
    }
    if (digits.length == 11 && digits.startsWith('0')) {
      return digits.substring(1);
    }
    if (digits.length >= 10) {
      return digits.substring(digits.length - 10);
    }
    return digits;
  }

  void _onPhoneChanged(String value, {required int guardianIndex}) {
    final query = value.trim();
    if (query.isEmpty || query.length >= 10) {
      if (_activeSuggestionGuardianIndex != null) {
        setState(() {
          _activeSuggestionGuardianIndex = null;
          _filteredSuggestions = [];
        });
      }
      return;
    }

    if (_allContactSuggestions.isEmpty && !_isLoadingContacts && !_hasRequestedContactsPermission) {
      _hasRequestedContactsPermission = true;
      _initContacts().then((_) {
        if (mounted) _onPhoneChanged(value, guardianIndex: guardianIndex);
      });
      return;
    }

    final prefixMatches = _allContactSuggestions
        .where((c) => c.phoneNumber.startsWith(query))
        .toList();
    final containMatches = _allContactSuggestions
        .where((c) => !c.phoneNumber.startsWith(query) && c.phoneNumber.contains(query))
        .toList();

    final matches = [...prefixMatches, ...containMatches].take(5).toList();

    setState(() {
      _activeSuggestionGuardianIndex = matches.isNotEmpty ? guardianIndex : null;
      _filteredSuggestions = matches;
    });
  }

  void _selectSuggestion(_ContactSuggestion suggestion, int guardianIndex) {
    if (guardianIndex >= 0 && guardianIndex < _guardianPhoneControllers.length) {
      setState(() {
        _guardianPhoneControllers[guardianIndex].text = suggestion.phoneNumber;
        _guardianPhoneControllers[guardianIndex].selection =
            TextSelection.collapsed(offset: suggestion.phoneNumber.length);
        if (_guardianNameControllers[guardianIndex].text.trim().isEmpty &&
            suggestion.name != 'Contact') {
          _guardianNameControllers[guardianIndex].text = suggestion.name;
        }
        if (guardianIndex < _guardianPhoneErrors.length) {
          _guardianPhoneErrors[guardianIndex] = null;
        }
        _activeSuggestionGuardianIndex = null;
        _filteredSuggestions = [];
      });
    }
  }

  Future<void> _pickContactFromBook(int guardianIndex) async {
    try {
      final contact = await FlutterContacts.native.showPicker(
        properties: {ContactProperty.phone, ContactProperty.name},
      );
      if (contact != null && contact.phones.isNotEmpty) {
        final rawPhone = contact.phones.first.number;
        final cleanPhone = _normalizePhone(rawPhone);
        if (cleanPhone.length == 10) {
          _selectSuggestion(
            _ContactSuggestion(
              name: (contact.displayName != null && contact.displayName!.trim().isNotEmpty)
                  ? contact.displayName!.trim()
                  : 'Contact',
              phoneNumber: cleanPhone,
              rawNumber: rawPhone,
            ),
            guardianIndex,
          );
        }
      }
    } catch (_) {}
  }

  Widget _buildContactSuggestionsBox({
    required int guardianIndex,
    required String currentQuery,
  }) {
    if (_activeSuggestionGuardianIndex != guardianIndex || _filteredSuggestions.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: const EdgeInsets.only(top: 8, bottom: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFCBD5E1), width: 1.1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: const BoxDecoration(
              color: Color(0xFFF8FAFC),
              borderRadius: BorderRadius.vertical(top: Radius.circular(15)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(Icons.contacts_rounded, size: 14, color: AppColors.primaryNavy.withValues(alpha: 0.8)),
                    const SizedBox(width: 6),
                    const Text(
                      'Matching Contacts (Tap to Auto-fill)',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primaryNavy,
                        letterSpacing: -0.1,
                      ),
                    ),
                  ],
                ),
                InkWell(
                  onTap: () {
                    setState(() {
                      _activeSuggestionGuardianIndex = null;
                      _filteredSuggestions = [];
                    });
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(Icons.close, size: 14, color: AppColors.textMuted),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFE2E8F0)),

          ..._filteredSuggestions.map((suggestion) {
            final phone = suggestion.phoneNumber;
            final isPrefix = phone.startsWith(currentQuery);
            final prefixPart = isPrefix ? currentQuery : '';
            final nextPart = isPrefix
                ? phone.substring(currentQuery.length)
                : phone;

            return InkWell(
              onTap: () => _selectSuggestion(suggestion, guardianIndex),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: const Color(0xFFEFF6FF),
                      child: Text(
                        suggestion.name.isNotEmpty
                            ? suggestion.name[0].toUpperCase()
                            : '?',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF2563EB),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            suggestion.name,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryNavy,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          RichText(
                            text: TextSpan(
                              style: const TextStyle(
                                fontSize: 12.5,
                              ),
                              children: [
                                const TextSpan(
                                  text: '+91 ',
                                  style: TextStyle(
                                    color: AppColors.textMuted,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                if (isPrefix) ...[
                                  TextSpan(
                                    text: prefixPart,
                                    style: const TextStyle(
                                      color: AppColors.primaryNavy,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  TextSpan(
                                    text: nextPart,
                                    style: const TextStyle(
                                      color: Color(0xFF0284C7),
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ] else ...[
                                  TextSpan(
                                    text: phone,
                                    style: const TextStyle(
                                      color: Color(0xFF0284C7),
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0FDF4),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: const Color(0xFFBBF7D0)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Select',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF16A34A),
                            ),
                          ),
                          SizedBox(width: 3),
                          Icon(Icons.check_rounded, size: 12, color: Color(0xFF16A34A)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final isSmallScreen = mediaQuery.size.width < 360;
    final horizontalPad = isSmallScreen ? 14.0 : 20.0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.primaryNavy, size: 22),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const DeviAppBarBadge(),
        titleSpacing: 0,
      ),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(horizontal: horizontalPad, vertical: 12.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Screen Title
                  Text(
                    widget.isEditing ? 'Edit Your Profile' : 'Create Your Profile',
                    style: TextStyle(
                      fontSize: isSmallScreen ? 20 : 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryNavy,
                      letterSpacing: -0.4,
                    ),
                  ),

                  const SizedBox(height: 18),

                  // Avatar & Verification Hint
                  Center(
                    child: Column(
                      children: [
                        GestureDetector(
                          onTap: _showPhotoOptionsModal,
                          child: Tooltip(
                            message: 'Change profile photo',
                            child: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                Container(
                                  width: 90,
                                  height: 90,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(22),
                                    color: Colors.grey.shade100,
                                    border: Border.all(
                                      color: Colors.white,
                                      width: 3.5,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.1),
                                        blurRadius: 12,
                                        offset: const Offset(0, 4),
                                      ),
                                    ],
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(18.5),
                                    child: _buildAvatarImage(),
                                  ),
                                ),
                                Positioned(
                                  right: -8,
                                  bottom: -8,
                                  child: Container(
                                    width: 30,
                                    height: 30,
                                    decoration: BoxDecoration(
                                      color: AppColors.primaryNavy,
                                      shape: BoxShape.circle,
                                      border: Border.all(color: Colors.white, width: 2.5),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black.withValues(alpha: 0.15),
                                          blurRadius: 4,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                    child: const Icon(
                                      Icons.camera_alt,
                                      size: 15,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        // Explicit "Upload Photo" Action Button
                        TextButton.icon(
                          onPressed: _showPhotoOptionsModal,
                          icon: const Icon(Icons.add_a_photo_outlined, size: 14, color: AppColors.primaryNavy),
                          label: Text(
                            _selectedPhotoPath != null ? 'Change Photo' : 'Upload Photo',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryNavy,
                            ),
                          ),
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: const [
                            Icon(
                              Icons.verified_user_outlined,
                              size: 13,
                              color: AppColors.verifiedGreen,
                            ),
                            SizedBox(width: 5),
                            Flexible(
                              child: Text(
                                'Helps the safety desk recognize you',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.textMuted,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Form Fields
                  CustomTextField(
                    label: 'Name',
                    hintText: 'Enter your name',
                    controller: _nameController,
                    prefixIcon: Icons.person_outline,
                    errorText: _nameError,
                    textCapitalization: TextCapitalization.words,
                    onChanged: (_) {
                      if (_nameError != null) setState(() => _nameError = null);
                    },
                  ),

                  const SizedBox(height: 14),

                  CustomTextField(
                    label: 'Mobile Number',
                    hintText: 'Enter mobile number',
                    controller: _phoneController,
                    prefixIcon: Icons.phone_outlined,
                    prefixText: '+91',
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    errorText: _phoneError,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(10),
                    ],
                    onChanged: (_) {
                      if (_phoneError != null) setState(() => _phoneError = null);
                    },
                  ),

                  const SizedBox(height: 14),

                  CustomTextField(
                    label: 'Address',
                    labelTrailing: const Text(
                      'Mandatory',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.mandatoryRed,
                      ),
                    ),
                    hintText: 'Enter Complete Address',
                    controller: _address1Controller,
                    prefixIcon: Icons.location_on_outlined,
                    errorText: _address1Error,
                    onChanged: (_) {
                      if (_address1Error != null) setState(() => _address1Error = null);
                    },
                  ),

                  const SizedBox(height: 20),

                  // Add Guardians Section
                  const Text(
                    'Add Guardians',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryNavy,
                      letterSpacing: -0.2,
                    ),
                  ),

                  const SizedBox(height: 10),

                  ...List.generate(_guardianPhoneControllers.length, (index) {
                    final nameErr = index < _guardianNameErrors.length ? _guardianNameErrors[index] : null;
                    final phoneErr = index < _guardianPhoneErrors.length ? _guardianPhoneErrors[index] : null;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 14.0),
                      padding: const EdgeInsets.all(14.0),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: (nameErr != null || phoneErr != null)
                              ? AppColors.emergencyRed.withValues(alpha: 0.5)
                              : AppColors.borderCard,
                          width: 1.2,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.02),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 24,
                                    height: 24,
                                    decoration: BoxDecoration(
                                      color: AppColors.primaryNavy.withValues(alpha: 0.08),
                                      shape: BoxShape.circle,
                                    ),
                                    child: Center(
                                      child: Text(
                                        '${index + 1}',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w800,
                                          color: AppColors.primaryNavy,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Guardian ${index + 1}',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primaryNavy,
                                    ),
                                  ),
                                  if (index == 0) ...[
                                    const SizedBox(width: 6),
                                    const Text(
                                      'Mandatory',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.mandatoryRed,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              if (index > 0)
                                InkWell(
                                  onTap: () => _removeGuardian(index),
                                  borderRadius: BorderRadius.circular(12),
                                  child: const Padding(
                                    padding: EdgeInsets.all(4.0),
                                    child: Icon(
                                      Icons.close_rounded,
                                      size: 18,
                                      color: AppColors.textMuted,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          CustomTextField(
                            label: 'Name',
                            hintText: 'Enter guardian name',
                            controller: _guardianNameControllers[index],
                            prefixIcon: Icons.person_outline,
                            errorText: nameErr,
                            textCapitalization: TextCapitalization.words,
                            onChanged: (_) {
                              if (index < _guardianNameErrors.length && _guardianNameErrors[index] != null) {
                                setState(() => _guardianNameErrors[index] = null);
                              }
                            },
                          ),
                          const SizedBox(height: 10),
                          CustomTextField(
                            label: 'Mobile Number',
                            hintText: 'Enter guardian phone number',
                            controller: _guardianPhoneControllers[index],
                            prefixIcon: Icons.phone_outlined,
                            prefixText: '+91',
                            keyboardType: TextInputType.phone,
                            autofillHints: const [AutofillHints.telephoneNumber],
                            errorText: phoneErr,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(10),
                            ],
                            suffixIcon: InkWell(
                              onTap: () => _pickContactFromBook(index),
                              borderRadius: BorderRadius.circular(16),
                              child: const Padding(
                                padding: EdgeInsets.all(4.0),
                                child: Icon(Icons.contacts_rounded, size: 20, color: Color(0xFF0284C7)),
                              ),
                            ),
                            onChanged: (val) {
                              if (index < _guardianPhoneErrors.length && _guardianPhoneErrors[index] != null) {
                                setState(() => _guardianPhoneErrors[index] = null);
                              }
                              _onPhoneChanged(val, guardianIndex: index);
                            },
                          ),

                          _buildContactSuggestionsBox(
                            guardianIndex: index,
                            currentQuery: _guardianPhoneControllers[index].text.trim(),
                          ),
                        ],
                      ),
                    );
                  }),

                  // + Add Guardian Button
                  AddGuardianButton(
                    onPressed: _addGuardian,
                  ),

                  const SizedBox(height: 28),

                  // Finish Button
                  DeviPrimaryButton(
                    text: _isSaving
                        ? 'Saving...'
                        : (widget.isEditing ? 'Save Changes' : 'Complete Registration'),
                    height: 50,
                    trailing: _isSaving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : null,
                    onPressed: _isSaving ? null : _onFinish,
                  ),

                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
