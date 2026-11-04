import 'package:country_picker/country_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:devi/utils/phone_utils.dart';

void main() {
  tearDown(() {
    PhoneUtils.allowedCountries = const ['IN'];
    PhoneUtils.guestCountries = const ['IN'];
  });

  test('field digits become E.164 for the chosen country', () {
    expect(PhoneUtils.fromField('9876543210', Country.parse('IN')), '+919876543210');
    expect(PhoneUtils.fromField('501234567', Country.parse('AE')), '+971501234567');
    expect(PhoneUtils.fromField('81234567', Country.parse('SG')), '+6581234567');
  });

  test('a number that is not a mobile of that country is refused', () {
    expect(PhoneUtils.fromField('5876543210', Country.parse('IN')), isNull);
    expect(PhoneUtils.fromField('12345', Country.parse('IN')), isNull);
    expect(PhoneUtils.fromField('', Country.parse('IN')), isNull);
    expect(PhoneUtils.fromField('9876543210', Country.parse('AE')), isNull);
  });

  test('numbers saved by older app builds move to E.164', () {
    expect(PhoneUtils.normalize('9876543210'), '+919876543210');
    expect(PhoneUtils.normalize('+919876543210'), '+919876543210');
    expect(PhoneUtils.normalize('919876543210'), '+919876543210');
  });

  test('guest IDs stay as they are', () {
    const guestId = 'GUEST_0123456789ABCDEF0123456789ABCDEF';
    expect(PhoneUtils.normalize(guestId), guestId);
    expect(PhoneUtils.display(guestId), guestId);
  });

  test('contacts in any format, only from open countries', () {
    final india = Country.parse('IN');
    expect(PhoneUtils.fromContact('098765 43210', india), '+919876543210');
    expect(PhoneUtils.fromContact('+91 98765-43210', india), '+919876543210');
    expect(PhoneUtils.fromContact('+971 50 123 4567', india), isNull);
    PhoneUtils.allowedCountries = const ['IN', 'AE'];
    expect(PhoneUtils.fromContact('+971 50 123 4567', india), '+971501234567');
  });

  test('a contact without a country code belongs to the chosen country', () {
    PhoneUtils.allowedCountries = const ['ALL'];
    expect(PhoneUtils.fromContact('050 123 4567', Country.parse('AE')), '+971501234567');
    expect(PhoneUtils.isOpen('SG'), isTrue);
  });

  test('India is the only open country by default', () {
    expect(PhoneUtils.isOpen('IN'), isTrue);
    expect(PhoneUtils.isOpen('AE'), isFalse);
  });

  test('all countries open still keeps Instant SOS to its own list', () {
    PhoneUtils.allowedCountries = const ['ALL'];
    expect(PhoneUtils.isOpen('AE'), isTrue);
    expect(PhoneUtils.isOpenForGuests('AE'), isFalse);
    expect(PhoneUtils.isOpenForGuests('IN'), isTrue);
  });

  test('a saved number fills its field and reads well', () {
    expect(PhoneUtils.countryOf('+971501234567').countryCode, 'AE');
    expect(PhoneUtils.nationalOf('+919876543210'), '9876543210');
    expect(PhoneUtils.display('+919876543210'), '+91 98765 43210');
  });
}
