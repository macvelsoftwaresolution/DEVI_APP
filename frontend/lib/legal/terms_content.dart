/// Terms of Use & Privacy notice shown on first launch.
///
/// DRAFT: this text must be reviewed by the company's legal advisor before release.
/// When the text changes in a way users must re-accept, bump [version]: every user
/// sees the terms screen again on their next launch.
class TermsContent {
  TermsContent._();

  // v3: evidence recording (camera + microphone) removed until Phase 2
  // v4: no one at DEVI watches alerts; guardians are the ones who help; call 112 in danger
  static const String version = 'v4-draft';
  static const String lastUpdated = 'November 2026';
  static const String company = 'Macvel Software Solutions';

  // TODO(legal): add the official support / grievance email before release
  static const String contactEmail = '';

  // Public pages on the web portal (web/public/privacy, web/public/delete-account)
  static const String privacyUrl = 'https://devi.macvelsoftware.com/privacy/';
  static const String deleteAccountUrl = 'https://devi.macvelsoftware.com/delete-account/';

  static const List<TermsSection> sections = [
    TermsSection(
      'What DEVI does',
      'DEVI helps you ask for help in an emergency. When you press SOS, DEVI sends a WhatsApp '
          'message with your location at that moment to the guardians you add, and calls them. '
          'Your guardians are the people who help you.',
    ),
    TermsSection(
      'DEVI is not an emergency service',
      'No one at DEVI watches SOS alerts or answers them, day or night. DEVI does not send '
          'police or an ambulance. DEVI depends on your phone, battery, GPS, mobile network, '
          'internet and WhatsApp, and an alert can be delayed or fail to reach someone.\n'
          'In danger, call 112 (emergency) or 181 (women\'s helpline) yourself, as well as '
          'pressing SOS.',
    ),
    TermsSection(
      'What we collect and why',
      '• Your name and mobile number, to identify you in an alert.\n'
          '• Your guardians\' names and mobile numbers, to alert them.\n'
          '• Your location, read once when you press SOS, so your guardians know where you '
          'were. DEVI does not track your location after that.\n'
          '• DEVI does not use your camera or microphone and does not record video or audio.',
    ),
    TermsSection(
      'Who can see your SOS data',
      'Your guardians (a WhatsApp message with a map link to your SOS location), and authorised DEVI '
          'staff when they look into a problem or a request from you. Every such access is logged. '
          'We do not sell your data. Police may receive it only when '
          'you or your guardians ask for help, or when the law requires it.',
    ),
    TermsSection(
      'Your guardians',
      'Add only people who have agreed to be your emergency contacts. They will receive '
          'WhatsApp messages from DEVI with your name and location during an SOS.',
    ),
    TermsSection(
      'False alarms',
      'A 5-second countdown lets you cancel an accidental SOS. Please do not trigger SOS '
          'for testing on real contacts without telling them first.',
    ),
    TermsSection(
      'Your choices',
      'You can change or remove your guardians at any time in Settings. You can ask us to '
          'delete your account and SOS history. You can withdraw consent by uninstalling '
          'the app; SOS features need location access to work.',
    ),
  ];
}

class TermsSection {
  final String title;
  final String body;
  const TermsSection(this.title, this.body);
}
