import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../utils/phone_utils.dart';

/// Flag and country code in front of a number field. Opens the country list when the server
/// has more than one country open; with one country it only shows it.
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
    final canChange = PhoneUtils.allowedCountries.length > 1;
    final color = hasError ? AppColors.emergencyRed : AppColors.primaryNavy;

    return InkWell(
      onTap: canChange
          ? () => showCountryPicker(
                context: context,
                countryFilter: PhoneUtils.allowedCountries,
                showPhoneCode: true,
                onSelect: onChanged,
              )
          : null,
      borderRadius: BorderRadius.circular(8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${country.flagEmoji} +${country.phoneCode}',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color),
          ),
          if (canChange) Icon(Icons.arrow_drop_down_rounded, size: 20, color: color),
        ],
      ),
    );
  }
}
