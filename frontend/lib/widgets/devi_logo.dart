import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class DeviLogoBadge extends StatelessWidget {
  final double size;
  final bool showShadow;

  const DeviLogoBadge({
    super.key,
    this.size = 84,
    this.showShadow = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: showShadow
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.08),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ]
            : null,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.22),
        child: Image.asset(
          'assets/images/devi-logo.png',
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) => _FallbackLogo(size: size * 0.65),
        ),
      ),
    );
  }
}

class DeviAppBarBadge extends StatelessWidget {
  final String title;
  final String? subtitle;
  final double logoSize;
  final double fontSize;

  const DeviAppBarBadge({
    super.key,
    this.title = 'Your Safety Guardian',
    this.subtitle,
    this.logoSize = 32,
    this.fontSize = 13,
  });

  @override
  Widget build(BuildContext context) {
    final titleText = Text(
      title,
      style: TextStyle(
        fontSize: fontSize,
        fontWeight: FontWeight.w800,
        color: AppColors.primaryNavy,
        letterSpacing: subtitle != null ? 0.5 : 0,
        height: 1.1,
      ),
      overflow: TextOverflow.ellipsis,
    );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: logoSize,
          height: logoSize,
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(logoSize / 4),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(logoSize / 4 - 2),
            child: Image.asset(
              'assets/images/devi-logo.png',
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => _FallbackLogo(size: logoSize - 4),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: subtitle == null
              ? titleText
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    titleText,
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textMuted,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _FallbackLogo extends StatelessWidget {
  final double size;
  const _FallbackLogo({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFF5722), Color(0xFFD81B60)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(size * 0.25),
      ),
      child: Center(
        child: Icon(
          Icons.shield,
          color: Colors.white,
          size: size * 0.6,
        ),
      ),
    );
  }
}
