import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class DeviPrimaryButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final Widget? trailing;
  final Color backgroundColor;
  final Color textColor;
  final double height;

  const DeviPrimaryButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.trailing,
    this.backgroundColor = AppColors.primaryNavy,
    this.textColor = Colors.white,
    this.height = 50,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: height,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: textColor,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(height / 2),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              text,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: textColor,
                letterSpacing: -0.2,
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 8),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

class GuestUserButton extends StatelessWidget {
  final VoidCallback onPressed;
  final String title;
  final String subtitle;
  final double height;

  const GuestUserButton({
    super.key,
    required this.onPressed,
    this.title = 'Instant SOS',
    this.subtitle = '',
    this.height = 50,
  });

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(height / 2);
    final isCompact = height <= 52;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: borderRadius,
        child: Container(
          height: height,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: AppColors.emergencyRed,
            borderRadius: borderRadius,
            boxShadow: [
              BoxShadow(
                color: AppColors.emergencyRed.withValues(alpha: 0.35),
                blurRadius: isCompact ? 12 : 16,
                offset: Offset(0, isCompact ? 4 : 6),
              ),
            ],
          ),
          child: Row(
            children: [
              // Flash icon in badge
              Container(
                width: isCompact ? 32 : 40,
                height: isCompact ? 32 : 40,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.22),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.35),
                    width: 1.2,
                  ),
                ),
                child: Center(
                  child: Icon(
                    Icons.bolt_rounded,
                    color: Colors.white,
                    size: isCompact ? 19 : 24,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: subtitle.isEmpty
                    ? Row(
                        children: [
                          Text(
                            title,
                            style: TextStyle(
                              fontSize: isCompact ? 15 : 16,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: EdgeInsets.symmetric(
                              horizontal: isCompact ? 6 : 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.45),
                                width: 0.8,
                              ),
                            ),
                            child: const Text(
                              'FAST',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                                letterSpacing: 0.4,
                              ),
                            ),
                          ),
                        ],
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                title,
                                style: TextStyle(
                                  fontSize: isCompact ? 14 : 16,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  letterSpacing: -0.2,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.25),
                                  borderRadius: BorderRadius.circular(5),
                                  border: Border.all(
                                    color: Colors.white.withValues(alpha: 0.45),
                                    width: 0.8,
                                  ),
                                ),
                                child: const Text(
                                  'FAST',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                    letterSpacing: 0.4,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 1),
                          Text(
                            subtitle,
                            style: TextStyle(
                              fontSize: isCompact ? 10 : 11,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withValues(alpha: 0.85),
                            ),
                          ),
                        ],
                      ),
              ),
              Container(
                width: isCompact ? 28 : 32,
                height: isCompact ? 28 : 32,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.22),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.arrow_forward_rounded,
                  color: Colors.white,
                  size: isCompact ? 15 : 17,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AddGuardianButton extends StatelessWidget {
  final VoidCallback onPressed;

  const AddGuardianButton({
    super.key,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFFB5102F),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.badge_outlined,
                color: Colors.white,
                size: 14,
              ),
              SizedBox(width: 6),
              Text(
                '+ Add Guardian',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  letterSpacing: -0.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
