import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_colors.dart';
import '../utils/phone_utils.dart';
import 'devi_button.dart';

/// Asks for the 6-digit code sent to [phone] on WhatsApp. Call it after the code was sent.
/// [onVerify] and [onResend] return an error to show, or null when they worked.
/// Returns true once the code is accepted, false or null if the sheet was closed.
Future<bool?> showOtpSheet(
  BuildContext context, {
  required String phone,
  required Future<String?> Function(String code) onVerify,
  required Future<String?> Function() onResend,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => _OtpSheet(phone: phone, onVerify: onVerify, onResend: onResend),
  );
}

class _OtpSheet extends StatefulWidget {
  final String phone;
  final Future<String?> Function(String code) onVerify;
  final Future<String?> Function() onResend;

  const _OtpSheet({required this.phone, required this.onVerify, required this.onResend});

  @override
  State<_OtpSheet> createState() => _OtpSheetState();
}

class _OtpSheetState extends State<_OtpSheet> {
  static const int _resendSeconds = 60;

  final _controller = TextEditingController();
  Timer? _timer;
  int _secondsLeft = _resendSeconds;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _secondsLeft = _resendSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_secondsLeft <= 1) timer.cancel();
      setState(() => _secondsLeft--);
    });
  }

  Future<void> _verify() async {
    final code = _controller.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.onVerify(code);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _busy = false;
      _error = error;
    });
  }

  Future<void> _resend() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.onResend();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null) {
      _controller.clear();
      _startTimer();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Enter the code',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
              ),
              const SizedBox(height: 8),
              Text(
                'We sent a 6-digit code to ${PhoneUtils.display(widget.phone)} on WhatsApp.',
                style: const TextStyle(fontSize: 14, height: 1.45, color: AppColors.textMuted),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: _controller,
                autofocus: true,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 8,
                  color: AppColors.primaryNavy,
                ),
                decoration: InputDecoration(
                  hintText: '······',
                  filled: true,
                  fillColor: AppColors.inputFill,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
                onSubmitted: (_) => _verify(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.emergencyRed),
                ),
              ],
              const SizedBox(height: 16),
              DeviPrimaryButton(
                text: _busy ? 'Please wait...' : 'Verify',
                onPressed: _busy ? null : _verify,
              ),
              const SizedBox(height: 4),
              Center(
                child: TextButton(
                  onPressed: _secondsLeft > 0 || _busy ? null : _resend,
                  child: Text(
                    _secondsLeft > 0 ? 'Resend code in ${_secondsLeft}s' : 'Resend code',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
