import 'package:flutter/material.dart';
import '../../services/onboarding_service.dart';
import '../../theme/app_colors.dart';
import '../../widgets/devi_button.dart';
import 'onboarding_flow.dart';
import 'terms_screen.dart';

class LanguageScreen extends StatefulWidget {
  final bool isLoggedIn;
  const LanguageScreen({super.key, required this.isLoggedIn});

  @override
  State<LanguageScreen> createState() => _LanguageScreenState();
}

class _AppLanguage {
  final String code;
  final String nativeName;
  final String englishName;
  final bool available;
  const _AppLanguage(this.code, this.nativeName, this.englishName, {this.available = false});
}

class _LanguageScreenState extends State<LanguageScreen> {
  // Tamil and Hindi are listed but disabled until their translations are ready
  static const _languages = [
    _AppLanguage('en', 'English', 'English', available: true),
    _AppLanguage('ta', 'தமிழ்', 'Tamil'),
    _AppLanguage('hi', 'हिंदी', 'Hindi'),
  ];

  String _selected = 'en';
  bool _saving = false;

  Future<void> _continue() async {
    setState(() => _saving = true);
    await OnboardingService.setLanguage(_selected);
    if (!mounted) return;
    OnboardingFlow.replaceWith(context, TermsScreen(isLoggedIn: widget.isLoggedIn));
  }

  @override
  Widget build(BuildContext context) {
    return OnboardingScaffold(
      step: 'STEP 1 OF 3',
      title: 'Choose your language',
      subtitle: 'You can change this later in Settings.',
      bottom: DeviPrimaryButton(
        text: 'Continue',
        onPressed: _saving ? null : _continue,
      ),
      child: ListView.separated(
        itemCount: _languages.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          final lang = _languages[i];
          final selected = _selected == lang.code;
          return Opacity(
            opacity: lang.available ? 1 : 0.5,
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: lang.available ? () => setState(() => _selected = lang.code) : null,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: selected ? AppColors.primaryNavy : AppColors.borderCard,
                      width: selected ? 2 : 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              lang.nativeName,
                              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.textDark),
                            ),
                            if (lang.nativeName != lang.englishName)
                              Text(lang.englishName, style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
                          ],
                        ),
                      ),
                      if (!lang.available)
                        const Text('Coming soon', style: TextStyle(fontSize: 12, color: AppColors.textMuted))
                      else
                        Icon(
                          selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                          color: selected ? AppColors.primaryNavy : AppColors.textLight,
                        ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
