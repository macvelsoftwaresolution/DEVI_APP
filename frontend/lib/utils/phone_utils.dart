import 'package:country_picker/country_picker.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

/// Phone numbers in the app are E.164 ("+919876543210"), like on the server.
/// A number field holds the digits after the country code; its country is kept beside it.
class PhoneUtils {
  static const String defaultIso = 'IN';

  /// Countries that can be used. Replaced by the server's list (ALLOWED_COUNTRIES) at startup.
  static List<String> allowedCountries = const [defaultIso];

  static Country get defaultCountry => Country.parse(defaultIso);

  static bool isOpen(String iso) => allowedCountries.contains('ALL') || allowedCountries.contains(iso);

  static int maxDigits(Country country) => country.countryCode == defaultIso ? 10 : 15;

  /// Reads any stored or contact number. Without a country code it belongs to [iso].
  static PhoneNumber? _parse(String raw, [String iso = defaultIso]) {
    var text = raw.trim();
    if (RegExp(r'^91\d{10}$').hasMatch(text)) text = '+$text';
    if (!RegExp(r'\d').hasMatch(text) || text.startsWith('GUEST_')) return null;
    try {
      final number = PhoneNumber.parse(text, callerCountry: IsoCode.values.byName(iso));
      return number.isValid(type: PhoneNumberType.mobile) ? number : null;
    } catch (_) {
      return null;
    }
  }

  /// E.164 number from a field's digits, or null if it is not a mobile number of that country.
  static String? fromField(String digits, Country country) {
    try {
      final number = PhoneNumber.parse(
        digits.trim(),
        destinationCountry: IsoCode.values.byName(country.countryCode),
      );
      return number.isValid(type: PhoneNumberType.mobile) ? number.international : null;
    } catch (_) {
      return null;
    }
  }

  /// E.164 form of a saved number. Guest IDs and anything else that is no number stay as they are.
  static String normalize(String raw) => _parse(raw)?.international ?? raw;

  /// E.164 number of a phone book contact, or null if it cannot be a guardian.
  /// Contacts are often saved without a country code: those are read as [country].
  static String? fromContact(String raw, Country country) {
    final number = _parse(raw, country.countryCode);
    if (number == null || !isOpen(number.isoCode.name)) return null;
    return number.international;
  }

  /// The country a saved number belongs to, to fill a number field.
  static Country countryOf(String phone) {
    final number = _parse(phone);
    if (number == null) return defaultCountry;
    return Country.tryParse(number.isoCode.name) ?? defaultCountry;
  }

  /// The digits after the country code, to fill a number field.
  static String nationalOf(String phone) => _parse(phone)?.nsn ?? phone;

  /// "+91 98765 43210"
  static String display(String phone) {
    final number = _parse(phone);
    return number == null ? phone : '+${number.countryCode} ${number.formatNsn()}';
  }
}
