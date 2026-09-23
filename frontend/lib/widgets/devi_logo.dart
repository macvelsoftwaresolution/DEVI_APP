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
          'assets/images/devi_logo.png',
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) => _FallbackLogo(size: size * 0.65),
        ),
      ),
    );
  }
}

class DeviAppBarBadge extends StatelessWidget {
  const DeviAppBarBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 32,
          height: 32,
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Image.asset(
            'assets/images/devi_logo.png',
            fit: BoxFit.contain,
            errorBuilder: (context, error, stackTrace) => const _FallbackLogo(size: 28),
          ),
        ),
        const SizedBox(width: 8),
        const Flexible(
          child: Text(
            'Women Safety',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.primaryNavy,
            ),
            overflow: TextOverflow.ellipsis,
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
