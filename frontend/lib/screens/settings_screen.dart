import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/app_state.dart';
import '../theme/app_colors.dart';
import 'login_screen.dart';
import 'profile_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final AppState _appState = AppState.instance;

  @override
  void initState() {
    super.initState();
    _appState.addListener(_onStateChange);
  }

  @override
  void dispose() {
    _appState.removeListener(_onStateChange);
    super.dispose();
  }

  void _onStateChange() {
    if (mounted) setState(() {});
  }

  void _showAddGuardianDialog() {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Row(
          children: [
            Icon(Icons.person_add_alt_1, color: AppColors.emergencyRed, size: 22),
            SizedBox(width: 8),
            Text(
              'Add Guardian',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.primaryNavy,
              ),
            ),
          ],
        ),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Guardian Name',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: nameController,
                textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(
                  hintText: 'Enter guardian name',
                  hintStyle: TextStyle(
                    color: AppColors.textMuted.withValues(alpha: 0.6),
                    fontSize: 14,
                  ),
                  floatingLabelBehavior: FloatingLabelBehavior.never,
                  filled: true,
                  fillColor: AppColors.inputFill,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.person_outline, size: 20, color: AppColors.textMuted),
                ),
                validator: (val) {
                  final text = val?.trim() ?? '';
                  if (text.isEmpty) return 'Please enter guardian name';
                  if (text.length < 2) return 'Name must be at least 2 characters';
                  if (!RegExp(r"^[a-zA-Z\s\.]+$").hasMatch(text)) {
                    return 'Name should only contain letters';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),
              const Text(
                'Mobile Number',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
                decoration: InputDecoration(
                  hintText: '9042024830',
                  hintStyle: TextStyle(
                    color: AppColors.textMuted.withValues(alpha: 0.6),
                    fontSize: 14,
                  ),
                  floatingLabelBehavior: FloatingLabelBehavior.never,
                  prefixText: '+91 ',
                  prefixStyle: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.textDark,
                  ),
                  filled: true,
                  fillColor: AppColors.inputFill,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.phone_outlined, size: 20, color: AppColors.textMuted),
                ),
                validator: (val) {
                  final phone = val?.trim() ?? '';
                  if (phone.isEmpty) return 'Please enter mobile number';
                  if (phone.length != 10) return 'Enter exactly 10 digits';
                  if (!RegExp(r'^[6-9]\d{9}$').hasMatch(phone)) {
                    return 'Starts with 6, 7, 8, or 9';
                  }
                  if (phone == _appState.phone) {
                    return 'Cannot be your own mobile number';
                  }
                  if (_appState.rawGuardians.any((g) => g.phone == phone)) {
                    return 'Guardian is already added';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          ElevatedButton(
            onPressed: () {
              if (formKey.currentState?.validate() ?? false) {
                _appState.addGuardian(
                  nameController.text.trim(),
                  phoneController.text.trim(),
                );
                Navigator.of(ctx).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('${nameController.text.trim()} added as guardian'),
                    backgroundColor: AppColors.primaryNavy,
                    duration: const Duration(seconds: 2),
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF9F1239),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            child: const Text('Add', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  void _showDeleteGuardianDialog(int index, String name) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Remove Guardian?'),
        content: Text('Are you sure you want to remove $name from your emergency contacts?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          ElevatedButton(
            onPressed: () {
              _appState.removeGuardian(index);
              Navigator.of(ctx).pop();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.emergencyRed,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: const Text('Remove', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _onLogout() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to log out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await AppState.instance.clearSession();
              if (!mounted) return;
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (context) => const LoginScreen()),
                (route) => false,
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.emergencyRed,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: const Text('Log Out', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _buildAvatarImage() {
    final photo = _appState.profilePhotoPath;
    final isGuest = _appState.isGuest;
    if (photo != null && photo.isNotEmpty && !isGuest) {
      if (photo.startsWith('assets/')) {
        return Image.asset(photo, fit: BoxFit.cover, errorBuilder: (context, error, stackTrace) => _buildAvatarFallback());
      } else if (kIsWeb) {
        return Image.network(photo, fit: BoxFit.cover, errorBuilder: (context, error, stackTrace) => _buildAvatarFallback());
      } else {
        final file = File(photo);
        if (file.existsSync()) {
          return Image.file(file, fit: BoxFit.cover, errorBuilder: (context, error, stackTrace) => _buildAvatarFallback());
        }
      }
    }
    return _buildAvatarFallback();
  }

  Widget _buildAvatarFallback() {
    final isGuest = _appState.isGuest;
    return Center(
      child: Text(
        isGuest ? 'G' : (_appState.name.isNotEmpty ? _appState.name[0].toUpperCase() : 'S'),
        style: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w800,
          color: Color(0xFFDB2777),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final guardians = _appState.guardians;
    final isGuest = _appState.isGuest;

    final mediaQuery = MediaQuery.of(context);
    final isSmallScreen = mediaQuery.size.width < 360;
    final horizontalPad = isSmallScreen ? 12.0 : 18.0;

    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFC),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.primaryNavy, size: 22),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Settings',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: AppColors.primaryNavy,
            letterSpacing: -0.3,
          ),
        ),
        centerTitle: false,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16.0),
            child: InkWell(
              onTap: _onLogout,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.logout_rounded,
                  color: Color(0xFFEF4444),
                  size: 20,
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(horizontal: horizontalPad, vertical: 16.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                // Profile Card (Matches Image 1)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16.0),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.04),
                        blurRadius: 14,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      // Avatar Circle with letter "S" and verified badge
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Container(
                            width: 54,
                            height: 54,
                            decoration: const BoxDecoration(
                              color: Color(0xFFFCE7F3),
                              shape: BoxShape.circle,
                            ),
                            child: ClipOval(
                              child: _buildAvatarImage(),
                            ),
                          ),
                          Positioned(
                            bottom: -2,
                            right: -2,
                            child: Container(
                              width: 18,
                              height: 18,
                              decoration: BoxDecoration(
                                color: isGuest ? Colors.grey : const Color(0xFF0D9488),
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 2),
                              ),
                              child: const Icon(
                                Icons.check,
                                color: Colors.white,
                                size: 10,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(width: 14),

                      // Name & Status
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              isGuest ? 'Guest User' : _appState.name,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppColors.primaryNavy,
                                letterSpacing: -0.2,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 3),
                            RichText(
                              text: TextSpan(
                                text: isGuest ? 'Direct Emergency Mode • ' : '+91 ${_appState.phone} • ',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.textMuted,
                                ),
                                children: [
                                  TextSpan(
                                    text: isGuest ? 'Guest' : 'Registered User',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: isGuest
                                          ? const Color(0xFFE53E5B)
                                          : const Color(0xFF0D9488),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Edit Pill Button
                      InkWell(
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (context) => const ProfileScreen(isEditing: true),
                            ),
                          );
                        },
                        borderRadius: BorderRadius.circular(18),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF1F2),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: const Color(0xFFFECDD3), width: 1),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.edit_outlined,
                                size: 13,
                                color: Color(0xFFE11D48),
                              ),
                              SizedBox(width: 4),
                              Text(
                                'Edit',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFFE11D48),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Section Header: "MY GUARDIANS" & "+ Add Guardian" Button
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Flexible(
                      child: Text(
                        'MY GUARDIANS',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textMuted,
                          letterSpacing: 0.6,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),

                    // + Add Guardian Button (Pill shaped with crimson bg)
                    InkWell(
                      onTap: _showAddGuardianDialog,
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                        decoration: BoxDecoration(
                          color: const Color(0xFF9F1239),
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF9F1239).withValues(alpha: 0.25),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.group_add_outlined,
                              size: 14,
                              color: Colors.white,
                            ),
                            SizedBox(width: 5),
                            Text(
                              '+ Add Guardian',
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 14),

                // Guardians List
                if (guardians.isEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      children: [
                        const Icon(Icons.shield_outlined, size: 36, color: AppColors.textMuted),
                        const SizedBox(height: 8),
                        const Text(
                          'No Guardians Added Yet',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primaryNavy,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Add emergency contacts to receive instant SMS & GPS alerts.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  )
                else
                  ...List.generate(guardians.length, (index) {
                    final guardian = guardians[index];
                    final initial = guardian.name.isNotEmpty ? guardian.name[0].toUpperCase() : 'G';
                    // Alternate pastel colors for avatars
                    final avatarBg = index % 2 == 0
                        ? const Color(0xFFFCE7F3)
                        : const Color(0xFFE0E7FF);
                    final avatarTextColor = index % 2 == 0
                        ? const Color(0xFFDB2777)
                        : const Color(0xFF4338CA);

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12.0),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.03),
                              blurRadius: 10,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: Row(
                          children: [
                            // Circular Initial Avatar
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: avatarBg,
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  initial,
                                  style: TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                    color: avatarTextColor,
                                  ),
                                ),
                              ),
                            ),

                            const SizedBox(width: 14),

                            // Name & Phone
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    guardian.name,
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primaryNavy,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '+91 ${guardian.phone}',
                                    style: const TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w500,
                                      color: AppColors.textMuted,
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            // Trash / Delete button
                            IconButton(
                              icon: const Icon(
                                Icons.delete_outline_rounded,
                                color: AppColors.textMuted,
                                size: 20,
                              ),
                              onPressed: () => _showDeleteGuardianDialog(index, guardian.name),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),

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
