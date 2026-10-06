import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_colors.dart';

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

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() ?? false) {
      final name = _nameController.text.trim();
      final phone = _phoneController.text.trim();
      widget.onGuardianAdded(name, phone);
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
