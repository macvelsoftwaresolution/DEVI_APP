import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import '../../services/app_state.dart';
import '../../services/onboarding_service.dart';
import '../../theme/app_colors.dart';
import '../../widgets/devi_button.dart';
import '../../widgets/input_field.dart';
import '../login_screen.dart';
import 'onboarding_flow.dart';

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

/// Name + one guardian, asked once before the login screen, so every SOS
/// (Instant SOS included) reaches a real person instead of only the control room.
class QuickSetupScreen extends StatefulWidget {
  const QuickSetupScreen({super.key});

  @override
  State<QuickSetupScreen> createState() => _QuickSetupScreenState();
}

class _QuickSetupScreenState extends State<QuickSetupScreen> {
  final _nameController = TextEditingController();
  final _guardianNameController = TextEditingController();
  final _guardianPhoneController = TextEditingController();

  String? _nameError;
  String? _guardianNameError;
  String? _guardianPhoneError;
  bool _saving = false;

  List<_ContactSuggestion> _allContactSuggestions = [];
  List<_ContactSuggestion> _filteredSuggestions = [];
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

    // Pre-fill if the user already started setup (e.g. came back from Sign in)
    final state = AppState.instance;
    _nameController.text = state.setupName;
    if (state.setupGuardians.isNotEmpty) {
      _guardianNameController.text = state.setupGuardians.first.name;
      _guardianPhoneController.text = state.setupGuardians.first.phone;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _guardianNameController.dispose();
    _guardianPhoneController.dispose();
    super.dispose();
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

  void _onPhoneChanged(String value) {
    final query = value.trim();
    if (query.isEmpty || query.length >= 10) {
      if (_filteredSuggestions.isNotEmpty) {
        setState(() => _filteredSuggestions = []);
      }
      return;
    }

    if (_allContactSuggestions.isEmpty && !_isLoadingContacts && !_hasRequestedContactsPermission) {
      _hasRequestedContactsPermission = true;
      _initContacts().then((_) {
        if (mounted) _onPhoneChanged(value);
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
      _filteredSuggestions = matches;
    });
  }

  void _selectSuggestion(_ContactSuggestion suggestion) {
    setState(() {
      _guardianPhoneController.text = suggestion.phoneNumber;
      _guardianPhoneController.selection = TextSelection.collapsed(offset: suggestion.phoneNumber.length);
      if (_guardianNameController.text.trim().isEmpty && suggestion.name != 'Contact') {
        _guardianNameController.text = suggestion.name;
      }
      _guardianPhoneError = null;
      _guardianNameError = null;
      _filteredSuggestions = [];
    });
  }

  Future<void> _pickContactFromBook() async {
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
          );
        }
      }
    } catch (_) {}
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final guardianName = _guardianNameController.text.trim();
    final guardianPhone = _guardianPhoneController.text.trim();

    setState(() {
      _nameError = name.length < 2 ? 'Enter your name' : null;
      _guardianNameError = guardianName.length < 2 ? 'Enter your guardian\'s name' : null;
      _guardianPhoneError = guardianPhone.length != 10
          ? 'Enter a 10-digit mobile number'
          : !RegExp(r'^[6-9]\d{9}$').hasMatch(guardianPhone)
              ? 'Number must start with 6, 7, 8 or 9'
              : null;
    });
    if (_nameError != null || _guardianNameError != null || _guardianPhoneError != null) return;

    setState(() => _saving = true);
    await AppState.instance.saveQuickSetup(
      name: name,
      guardian: GuardianModel(name: guardianName, phone: guardianPhone),
    );
    await OnboardingService.markSetupDone();
    if (!mounted) return;
    OnboardingFlow.replaceWith(context, const LoginScreen());
  }

  void _signInInstead() {
    // Setup is marked done only after a successful sign in, so backing out returns here
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const LoginScreen(allowInstantSos: false)),
    );
  }

  Widget _buildContactSuggestionsBox({
    required String currentQuery,
  }) {
    if (_filteredSuggestions.isEmpty) {
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
              onTap: () => _selectSuggestion(suggestion),
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
    return OnboardingScaffold(
      step: 'STEP 2 OF 2',
      title: 'Who should we alert?',
      subtitle: 'When you press SOS, this person gets a WhatsApp message with your live location.',
      bottom: Column(
        children: [
          DeviPrimaryButton(
            text: 'Save & Continue',
            onPressed: _saving ? null : _save,
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _saving ? null : _signInInstead,
            child: const Text(
              'Already have an account? Sign in',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.primaryNavy),
            ),
          ),
        ],
      ),
      child: ListView(
        children: [
          CustomTextField(
            label: 'Your name',
            hintText: 'e.g. Priya',
            controller: _nameController,
            prefixIcon: Icons.person_outline_rounded,
            textCapitalization: TextCapitalization.words,
            errorText: _nameError,
            onChanged: (_) {
              if (_nameError != null) setState(() => _nameError = null);
            },
          ),
          const SizedBox(height: 18),
          CustomTextField(
            label: 'Guardian name',
            hintText: 'e.g. Amma',
            controller: _guardianNameController,
            prefixIcon: Icons.shield_outlined,
            textCapitalization: TextCapitalization.words,
            errorText: _guardianNameError,
            onChanged: (_) {
              if (_guardianNameError != null) setState(() => _guardianNameError = null);
            },
          ),
          const SizedBox(height: 18),
          CustomTextField(
            label: 'Guardian mobile number',
            hintText: '98765 43210',
            controller: _guardianPhoneController,
            // India only for now; a country picker replaces this prefix later
            prefixText: '🇮🇳 +91  ',
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            suffixIcon: InkWell(
              onTap: _pickContactFromBook,
              borderRadius: BorderRadius.circular(16),
              child: const Padding(
                padding: EdgeInsets.all(4.0),
                child: Icon(Icons.contacts_rounded, size: 20, color: Color(0xFF0284C7)),
              ),
            ),
            errorText: _guardianPhoneError,
            onChanged: (val) {
              if (_guardianPhoneError != null) setState(() => _guardianPhoneError = null);
              _onPhoneChanged(val);
            },
          ),
          _buildContactSuggestionsBox(
            currentQuery: _guardianPhoneController.text.trim(),
          ),
          const SizedBox(height: 14),
          const Text(
            'Make sure they agree to be your emergency contact. You can add more guardians later in Settings.',
            style: TextStyle(fontSize: 13, height: 1.4, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}
