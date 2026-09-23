import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/app_state.dart';
import '../theme/app_colors.dart';
import '../widgets/input_field.dart';
import '../widgets/devi_button.dart';
import '../widgets/devi_logo.dart';
import 'sos_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final TextEditingController _nameController;
  late final TextEditingController _phoneController;
  late final TextEditingController _address1Controller;
  late final TextEditingController _address2Controller;
  late final List<TextEditingController> _guardianControllers;

  String? _nameError;
  String? _phoneError;
  String? _address1Error;
  List<String?> _guardianErrors = [];
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    final state = AppState.instance;
    // If registered user is editing profile from settings, show current values
    final isEditing = state.name.isNotEmpty && !state.isGuest;
    _nameController = TextEditingController(text: isEditing ? state.name : '');
    _phoneController = TextEditingController(text: isEditing ? state.phone : '');
    _address1Controller = TextEditingController(text: isEditing ? state.address1 : '');
    _address2Controller = TextEditingController(text: isEditing ? state.address2 : '');

    final existingGuardians = state.rawGuardians;
    if (isEditing && existingGuardians.isNotEmpty) {
      _guardianControllers = existingGuardians
          .map((g) => TextEditingController(text: g.phone))
          .toList();
    } else {
      _guardianControllers = [
        TextEditingController(),
        TextEditingController(),
      ];
    }
    if (_guardianControllers.isEmpty) {
      _guardianControllers.add(TextEditingController());
      _guardianControllers.add(TextEditingController());
    }
    _guardianErrors = List.filled(_guardianControllers.length, null);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _address1Controller.dispose();
    _address2Controller.dispose();
    for (var controller in _guardianControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  void _addGuardian() {
    if (_guardianControllers.length < 5) {
      setState(() {
        _guardianControllers.add(TextEditingController());
        _guardianErrors.add(null);
      });
    }
  }

  Future<void> _onFinish() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final address1 = _address1Controller.text.trim();
    final address2 = _address2Controller.text.trim();

    bool hasError = false;

    // 1. Full Legal Name Validation
    if (name.isEmpty) {
      _nameError = 'Full legal name is required';
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
      _address1Error = 'Address line 1 is mandatory';
      hasError = true;
    } else if (address1.length < 5) {
      _address1Error = 'Enter complete address (minimum 5 characters)';
      hasError = true;
    } else {
      _address1Error = null;
    }

    // 4. Guardians Validation
    final List<GuardianModel> newGuardians = [];
    final existingGuardians = AppState.instance.rawGuardians;
    _guardianErrors = List.filled(_guardianControllers.length, null);

    final Set<String> seenPhones = {};
    int validGuardianCount = 0;

    for (int i = 0; i < _guardianControllers.length; i++) {
      final gPhone = _guardianControllers[i].text.trim();
      if (gPhone.isNotEmpty) {
        if (gPhone.length != 10) {
          _guardianErrors[i] = 'Must be exactly 10 digits';
          hasError = true;
        } else if (!RegExp(r'^[6-9]\d{9}$').hasMatch(gPhone)) {
          _guardianErrors[i] = 'Starts with 6, 7, 8, or 9';
          hasError = true;
        } else if (gPhone == phone) {
          _guardianErrors[i] = 'Cannot be your own number';
          hasError = true;
        } else if (seenPhones.contains(gPhone)) {
          _guardianErrors[i] = 'Duplicate guardian number';
          hasError = true;
        } else {
          seenPhones.add(gPhone);
          validGuardianCount++;
          final defaultName = i < existingGuardians.length
              ? existingGuardians[i].name
              : 'Guardian ${i + 1}';
          newGuardians.add(GuardianModel(name: defaultName, phone: gPhone));
        }
      }
    }

    if (validGuardianCount == 0) {
      if (_guardianErrors.isNotEmpty) {
        _guardianErrors[0] = 'At least 1 guardian is required';
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
    await AppState.instance.saveProfileToBackend(
      newName: name,
      newPhone: phone,
      newAddress1: address1,
      newAddress2: address2.isNotEmpty ? address2 : null,
      newGuardians: newGuardians,
    );

    if (!mounted) return;
    setState(() => _isSaving = false);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Profile saved to database successfully!'),
        backgroundColor: AppColors.primaryNavy,
        duration: Duration(seconds: 1),
      ),
    );

    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const SosScreen()),
      );
    }
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
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(horizontal: horizontalPad, vertical: 12.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Screen Title
                  Text(
                    'Create Your Profile',
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
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Container(
                              width: 86,
                              height: 86,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.grey.shade200,
                                border: Border.all(
                                  color: Colors.white,
                                  width: 3,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.08),
                                    blurRadius: 10,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: ClipOval(
                                child: Image.asset(
                                  'assets/images/profile_avatar.jpg',
                                  fit: BoxFit.cover,
                                  errorBuilder: (context, error, stackTrace) =>
                                      const Icon(
                                    Icons.person,
                                    size: 50,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              right: -2,
                              bottom: 0,
                              child: Container(
                                width: 26,
                                height: 26,
                                decoration: BoxDecoration(
                                  color: AppColors.primaryNavy,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                ),
                                child: const Icon(
                                  Icons.camera_alt,
                                  size: 13,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
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
                                'Helps verified responders recognize you',
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
                    label: 'Full Legal Name',
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
                    label: 'Address 1',
                    labelTrailing: const Text(
                      'Mandatory',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.mandatoryRed,
                      ),
                    ),
                    hintText: 'Enter address line 1',
                    controller: _address1Controller,
                    prefixIcon: Icons.location_on_outlined,
                    errorText: _address1Error,
                    onChanged: (_) {
                      if (_address1Error != null) setState(() => _address1Error = null);
                    },
                  ),

                  const SizedBox(height: 14),

                  CustomTextField(
                    label: 'Address 2',
                    labelTrailing: const Text(
                      'Optional',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.optionalGrey,
                      ),
                    ),
                    hintText: 'Enter address line 2 (optional)',
                    controller: _address2Controller,
                    prefixIcon: Icons.location_on_outlined,
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

                  ...List.generate(_guardianControllers.length, (index) {
                    final error = index < _guardianErrors.length ? _guardianErrors[index] : null;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12.0),
                      child: CustomTextField(
                        label: 'Guardian  ${index + 1}',
                        hintText: 'Enter guardian phone number',
                        controller: _guardianControllers[index],
                        prefixIcon: Icons.phone_outlined,
                        prefixText: '+91',
                        keyboardType: TextInputType.phone,
                        errorText: error,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(10),
                        ],
                        onChanged: (_) {
                          if (index < _guardianErrors.length && _guardianErrors[index] != null) {
                            setState(() => _guardianErrors[index] = null);
                          }
                        },
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
                    text: _isSaving ? 'Saving...' : 'Finish',
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
