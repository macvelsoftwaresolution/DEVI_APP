import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_colors.dart';

typedef InputField = CustomTextField;

class CustomTextField extends StatelessWidget {
  final String? label;
  final Widget? labelTrailing;
  final String? hintText;
  final TextEditingController? controller;
  final IconData? prefixIcon;
  final String? prefixText;
  final TextInputType? keyboardType;
  final bool isWhiteBackground;
  final ValueChanged<String>? onChanged;
  final String? errorText;
  final List<TextInputFormatter>? inputFormatters;
  final int? maxLength;
  final TextCapitalization textCapitalization;

  const CustomTextField({
    super.key,
    this.label,
    this.labelTrailing,
    this.hintText,
    this.controller,
    this.prefixIcon,
    this.prefixText,
    this.keyboardType,
    this.isWhiteBackground = true,
    this.onChanged,
    this.errorText,
    this.inputFormatters,
    this.maxLength,
    this.textCapitalization = TextCapitalization.none,
  });

  @override
  Widget build(BuildContext context) {
    final hasError = errorText != null && errorText!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  label!,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primaryNavy,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
              ?labelTrailing,
            ],
          ),
          const SizedBox(height: 7),
        ],
        Container(
          height: 48,
          decoration: BoxDecoration(
            color: isWhiteBackground ? Colors.white : AppColors.inputFill,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: hasError
                  ? AppColors.emergencyRed
                  : (isWhiteBackground
                      ? AppColors.borderCard
                      : Colors.transparent),
              width: hasError ? 1.4 : 1.2,
            ),
            boxShadow: isWhiteBackground
                ? [
                    BoxShadow(
                      color: hasError
                          ? AppColors.emergencyRed.withValues(alpha: 0.08)
                          : Colors.black.withValues(alpha: 0.02),
                      blurRadius: 6,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              if (prefixIcon != null) ...[
                Icon(
                  prefixIcon,
                  size: 18,
                  color: hasError ? AppColors.emergencyRed : AppColors.textMuted,
                ),
                const SizedBox(width: 8),
              ],
              if (prefixText != null) ...[
                Text(
                  prefixText!,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: hasError ? AppColors.emergencyRed : AppColors.primaryNavy,
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: TextField(
                  controller: controller,
                  keyboardType: keyboardType,
                  onChanged: onChanged,
                  inputFormatters: inputFormatters,
                  maxLength: maxLength,
                  buildCounter: (context, {required currentLength, required isFocused, maxLength}) => null,
                  textCapitalization: textCapitalization,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryNavy,
                  ),
                  decoration: InputDecoration(
                    hintText: hintText,
                    hintStyle: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                      color: AppColors.textLight,
                    ),
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                    border: InputBorder.none,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: 5),
          Padding(
            padding: const EdgeInsets.only(left: 14),
            child: Text(
              errorText!,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.emergencyRed,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
