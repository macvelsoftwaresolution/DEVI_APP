import 'package:flutter/material.dart';
import '../services/app_state.dart';
import '../theme/app_colors.dart';
import '../widgets/custom_text_field.dart';
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
      });
    }
  }

  void _onFinish() {
    // Extract non-empty guardian phone numbers entered by user
    final List<GuardianModel> newGuardians = [];
    final existingGuardians = AppState.instance.rawGuardians;

    for (int i = 0; i < _guardianControllers.length; i++) {
      final phone = _guardianControllers[i].text.trim();
      if (phone.isNotEmpty) {
        final defaultName = i < existingGuardians.length
            ? existingGuardians[i].name
            : 'Guardian ${i + 1}';
        newGuardians.add(GuardianModel(name: defaultName, phone: phone));
      }
    }

    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final address1 = _address1Controller.text.trim();
    final address2 = _address2Controller.text.trim();

    AppState.instance.updateProfile(
      newName: name.isNotEmpty ? name : 'Registered User',
      newPhone: phone.isNotEmpty ? phone : null,
      newAddress1: address1.isNotEmpty ? address1 : null,
      newAddress2: address2.isNotEmpty ? address2 : null,
      newGuardians: newGuardians.isNotEmpty ? newGuardians : null,
    );

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Profile saved successfully!'),
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
            padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Screen Title
                  const Text(
                    'Create Your Profile',
                    style: TextStyle(
                      fontSize: 22,
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
                            Text(
                              'Helps verified responders recognize you',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                                color: AppColors.textMuted,
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
                    label: 'Full Name',
                    hintText: 'Enter your name',
                    controller: _nameController,
                    prefixIcon: Icons.person_outline,
                  ),

                  const SizedBox(height: 14),

                  CustomTextField(
                    label: 'Mobile Number',
                    hintText: 'Enter mobile number',
                    controller: _phoneController,
                    prefixIcon: Icons.phone_outlined,
                    prefixText: '+91',
                    keyboardType: TextInputType.phone,
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
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12.0),
                      child: CustomTextField(
                        label: 'Guardian  ${index + 1}',
                        hintText: 'Enter guardian phone number',
                        controller: _guardianControllers[index],
                        prefixIcon: Icons.phone_outlined,
                        prefixText: '+91',
                        keyboardType: TextInputType.phone,
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
                    text: 'Finish',
                    height: 50,
                    onPressed: _onFinish,
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
