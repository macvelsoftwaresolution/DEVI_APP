import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../utils/phone_utils.dart';

/// Flag and country code in front of a number field. Tapping lists every country; one the server
/// has not opened cannot be picked, because SOS alerts to its numbers would never be sent.
class CountryPrefix extends StatelessWidget {
  final Country country;
  final ValueChanged<Country> onChanged;
  final bool hasError;

  const CountryPrefix({
    super.key,
    required this.country,
    required this.onChanged,
    this.hasError = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = hasError ? AppColors.emergencyRed : AppColors.primaryNavy;

    return InkWell(
      onTap: () => showCountryPicker(
        context: context,
        favorite: const [PhoneUtils.defaultIso],
        showPhoneCode: true,
        onSelect: (picked) {
          if (PhoneUtils.isOpen(picked.countryCode)) {
            onChanged(picked);
          } else {
            ScaffoldMessenger.of(context)
              ..hideCurrentSnackBar()
              ..showSnackBar(SnackBar(
                content: Text('DEVI is not available in ${picked.name} yet.'),
                behavior: SnackBarBehavior.floating,
              ));
          }
        },
      ),
      borderRadius: BorderRadius.circular(8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${country.flagEmoji} +${country.phoneCode}',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color),
          ),
          Icon(Icons.arrow_drop_down_rounded, size: 20, color: color),
        ],
      ),
    );
  }
}
