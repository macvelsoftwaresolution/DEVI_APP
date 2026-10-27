/// Terms of Use & Privacy notice shown on first launch.
///
/// DRAFT: this text must be reviewed by the company's legal advisor before release.
/// When the text changes in a way users must re-accept, bump [version]: every user
/// sees the terms screen again on their next launch.
class TermsContent {
  TermsContent._();

  static const String version = 'v2-draft';
  static const String lastUpdated = 'October 2026';
  static const String company = 'Macvel Software Solutions';

  // TODO(legal): add the official support / grievance email before release
  static const String contactEmail = '';

  static const List<TermsSection> sections = [
    TermsSection(
      'What DEVI does',
      'DEVI helps you ask for help in an emergency. When you press SOS, DEVI sends an alert '
          'with your location at that moment to the guardians you add, and records it for the '
          'DEVI emergency control room.',
    ),
    TermsSection(
      'DEVI is not a replacement for police or ambulance',
      'DEVI depends on your phone, battery, GPS, mobile network, internet and WhatsApp. '
          'An alert can be delayed or fail to reach someone. In danger, also call 112 '
          '(Police) or 1091 (Women Helpline) directly.',
    ),
    TermsSection(
      'What we collect and why',
      '• Your name and mobile number, to identify you in an alert.\n'
          '• Your guardians\' names and mobile numbers, to alert them.\n'
          '• Your location, read once when you press SOS, so your guardians know where you '
          'were. DEVI does not track your location after that.\n'
          '• Camera video and microphone audio, recorded for up to 2 minutes when you press '
          'SOS, as evidence for your guardians and the control room.',
    ),
    TermsSection(
      'Who can see your SOS data',
      'Your guardians (a WhatsApp message with a map link to your SOS location), and authorised DEVI '
          'control room staff. We do not sell your data. Police may receive it only when '
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
          'the app; SOS features need location, camera and microphone access to work.',
    ),
  ];
}

class TermsSection {
  final String title;
  final String body;
  const TermsSection(this.title, this.body);
}
