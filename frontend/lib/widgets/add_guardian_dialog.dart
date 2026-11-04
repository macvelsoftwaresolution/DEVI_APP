import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_colors.dart';
import '../utils/phone_utils.dart';
import 'country_prefix.dart';

/// Independent, reusable Add Guardian Dialog.
/// Can be invoked from any screen (SOS Screen, Settings Screen, etc.)
class AddGuardianDialog extends StatefulWidget {
  final Function(String name, String phone) onGuardianAdded;
  final String? currentUserPhone;
  final List<String> existingPhones;

  const AddGuardianDialog({
    super.key,
    required this.onGuardianAdded,
    this.currentUserPhone,
    this.existingPhones = const [],
  });

  /// Helper static method to easily present the dialog from anywhere.
  static Future<void> show(
    BuildContext context, {
    required Function(String name, String phone) onGuardianAdded,
    String? currentUserPhone,
    List<String> existingPhones = const [],
  }) {
    return showDialog<void>(
      context: context,
      builder: (ctx) => AddGuardianDialog(
        onGuardianAdded: onGuardianAdded,
        currentUserPhone: currentUserPhone,
        existingPhones: existingPhones,
      ),
    );
  }

  @override
  State<AddGuardianDialog> createState() => _AddGuardianDialogState();
}

class _AddGuardianDialogState extends State<AddGuardianDialog> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  Country _country = PhoneUtils.defaultCountry;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() ?? false) {
      final name = _nameController.text.trim();
      final phone = PhoneUtils.fromField(_phoneController.text, _country);
      widget.onGuardianAdded(name, phone!);
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$name added as guardian'),
          backgroundColor: AppColors.primaryNavy,
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
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
        key: _formKey,
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
              controller: _nameController,
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
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(PhoneUtils.maxDigits(_country)),
              ],
              decoration: InputDecoration(
                hintText: '9042024830',
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
                prefixIcon: Padding(
                  padding: const EdgeInsets.only(left: 14, right: 8),
                  child: CountryPrefix(
                    country: _country,
                    onChanged: (c) => setState(() => _country = c),
                  ),
                ),
                prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
              ),
              validator: (val) {
                final digits = val?.trim() ?? '';
                if (digits.isEmpty) return 'Please enter mobile number';
                final phone = PhoneUtils.fromField(digits, _country);
                if (phone == null) return 'Enter a valid mobile number';
                if (widget.currentUserPhone != null && phone == widget.currentUserPhone) {
                  return 'Cannot be your own mobile number';
                }
                if (widget.existingPhones.contains(phone)) {
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
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
        ),
        ElevatedButton(
          onPressed: _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.emergencyRed,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: const Text('Add', style: TextStyle(color: Colors.white)),
        ),
      ],
    );
  }
}
