import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import '../../services/app_state.dart';
import '../../services/onboarding_service.dart';
import '../../theme/app_colors.dart';
import '../../utils/phone_utils.dart';
import '../../widgets/country_prefix.dart';
import '../../widgets/devi_button.dart';
import '../../widgets/input_field.dart';
import '../login_screen.dart';
import '../sos_screen.dart';
import 'onboarding_flow.dart';

class _ContactSuggestion {
  final String name;
  final String phoneNumber; // Digits after the country code
  final Country country;
  final String rawNumber;

  _ContactSuggestion({
    required this.name,
    required String e164,
    required this.rawNumber,
  })  : phoneNumber = PhoneUtils.nationalOf(e164),
        country = PhoneUtils.countryOf(e164);
}

/// Name + one guardian, asked once on first run, so every SOS (Instant SOS included)
/// reaches a real person instead of only the control room. Saving opens the SOS screen
/// as a guest; sign in is offered later.
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
  Country _guardianCountry = PhoneUtils.defaultCountry;
  bool _saving = false;

  List<_ContactSuggestion> _allContactSuggestions = [];
  List<_ContactSuggestion> _filteredSuggestions = [];
  bool _isLoadingContacts = false;

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
      final saved = state.setupGuardians.first.phone;
      _guardianPhoneController.text = PhoneUtils.nationalOf(saved);
      _guardianCountry = PhoneUtils.countryOf(saved);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _guardianNameController.dispose();
    _guardianPhoneController.dispose();
    super.dispose();
  }

  /// Contacts permission is asked with the other permissions after terms. When it was
  /// denied there, it is asked again only when the user taps the contacts icon.
  Future<bool> _ensureContactsPermission() async {
    if (await FlutterContacts.permissions.has(PermissionType.read)) return true;
    final status = await FlutterContacts.permissions.request(PermissionType.read);
    return status == PermissionStatus.granted || status == PermissionStatus.limited;
  }

  Future<void> _initContacts() async {
    if (_allContactSuggestions.isNotEmpty || _isLoadingContacts) return;
    _isLoadingContacts = true;
    try {
      if (!await FlutterContacts.permissions.has(PermissionType.read)) {
        _isLoadingContacts = false;
        return;
      }
      final contacts = await FlutterContacts.getAll(
        properties: {ContactProperty.phone, ContactProperty.name},
      );
      final List<_ContactSuggestion> list = [];
      final Set<String> seen = {};
      for (final c in contacts) {
        final name = (c.displayName ?? '').trim();
        for (final p in c.phones) {
          final e164 = PhoneUtils.fromContact(p.number, _guardianCountry);
          if (e164 != null && !seen.contains(e164)) {
            seen.add(e164);
            list.add(_ContactSuggestion(
              name: name.isNotEmpty ? name : 'Contact',
              e164: e164,
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

  void _onPhoneChanged(String value) {
    final query = value.trim();
    if (query.isEmpty || query.length >= 10) {
      if (_filteredSuggestions.isNotEmpty) {
        setState(() => _filteredSuggestions = []);
      }
      return;
    }

    // Suggestions only when contacts were already allowed; typing never pops a permission dialog
    if (_allContactSuggestions.isEmpty) return;

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
      _guardianCountry = suggestion.country;
      // Picking a contact is deliberate, so its name replaces any earlier one
      if (suggestion.name != 'Contact') {
        _guardianNameController.text = suggestion.name;
      }
      _guardianPhoneError = null;
      _guardianNameError = null;
      _filteredSuggestions = [];
    });
  }

  Future<void> _pickContactFromBook() async {
    try {
      // The picker returns the contact, but reading its name and number needs the permission
      if (!await _ensureContactsPermission()) {
        _showMessage('Allow Contacts in Settings to pick a guardian, or type the number.');
        return;
      }
      _initContacts();
      final contact = await FlutterContacts.native.showPicker(
        properties: {ContactProperty.phone, ContactProperty.name},
      );
      if (contact == null) return;
      final phone = contact.phones
          .map((p) => (raw: p.number, e164: PhoneUtils.fromContact(p.number, _guardianCountry)))
          .where((p) => p.e164 != null)
          .firstOrNull;
      if (phone == null) {
        _showMessage('This contact has no valid mobile number.');
        return;
      }
      final name = contact.displayName?.trim() ?? '';
      _selectSuggestion(
        _ContactSuggestion(
          name: name.isNotEmpty ? name : 'Contact',
          e164: phone.e164!,
          rawNumber: phone.raw,
        ),
      );
    } catch (e) {
      debugPrint('Contact picker error: $e');
      _showMessage('Could not open contacts. Please type the number.');
    }
  }

  void _showMessage(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(text),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ));
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final guardianName = _guardianNameController.text.trim();
    final guardianPhone = PhoneUtils.fromField(_guardianPhoneController.text, _guardianCountry);

    setState(() {
      _nameError = name.length < 2 ? 'Enter your name' : null;
      _guardianNameError = guardianName.length < 2 ? 'Enter your guardian\'s name' : null;
      _guardianPhoneError = guardianPhone == null ? 'Enter a valid mobile number' : null;
    });
    if (_nameError != null || _guardianNameError != null || _guardianPhoneError != null) return;

    setState(() => _saving = true);
    await AppState.instance.saveQuickSetup(
      name: name,
      guardian: GuardianModel(name: guardianName, phone: guardianPhone!),
    );
    await OnboardingService.markSetupDone();
    // Straight to the SOS screen as a guest: no sign in stands between the user and Instant SOS
    AppState.instance.setGuestMode(true);
    if (!mounted) return;
    OnboardingFlow.replaceWith(context, const SosScreen());
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
                                TextSpan(
                                  text: '+${suggestion.country.phoneCode} ',
                                  style: const TextStyle(
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
            label: 'Guardian mobile number',
            hintText: '98765 43210',
            controller: _guardianPhoneController,
            prefix: CountryPrefix(
              country: _guardianCountry,
              hasError: _guardianPhoneError != null,
              onChanged: (c) => setState(() {
                _guardianCountry = c;
                _guardianPhoneError = null;
              }),
            ),
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(PhoneUtils.maxDigits(_guardianCountry)),
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
          const SizedBox(height: 18),
          // Below the number: picking a contact suggestion fills it in
          CustomTextField(
            label: 'Guardian name',
            hintText: 'Filled in from your contacts, or type it',
            controller: _guardianNameController,
            prefixIcon: Icons.shield_outlined,
            textCapitalization: TextCapitalization.words,
            errorText: _guardianNameError,
            onChanged: (_) {
              if (_guardianNameError != null) setState(() => _guardianNameError = null);
            },
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
