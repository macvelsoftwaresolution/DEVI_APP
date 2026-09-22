import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import 'history_screen.dart';
import 'settings_screen.dart';

class NoContactsScreen extends StatefulWidget {
  final bool autoStartCountdown;
  const NoContactsScreen({super.key, this.autoStartCountdown = true});

  @override
  State<NoContactsScreen> createState() => _NoContactsScreenState();
}

class _NoContactsScreenState extends State<NoContactsScreen> {
  bool _isSoundPlaying = false;
  Timer? _guestCountdownTimer;
  int _guestCountdownSeconds = 2;
  bool _isGuestCountingDown = false;

  @override
  void initState() {
    super.initState();
    if (widget.autoStartCountdown) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _startGuest2sTrigger();
        }
      });
    }
  }

  @override
  void dispose() {
    _guestCountdownTimer?.cancel();
    super.dispose();
  }

  void _startGuest2sTrigger() {
    if (!mounted) return;
    if (_isGuestCountingDown) {
      _cancelGuestCountdown();
      return;
    }

    setState(() {
      _isGuestCountingDown = true;
      _guestCountdownSeconds = 2;
    });

    _guestCountdownTimer?.cancel();
    _guestCountdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        if (_guestCountdownSeconds > 1) {
          _guestCountdownSeconds--;
        } else {
          _guestCountdownTimer?.cancel();
          _isGuestCountingDown = false;
          _guestCountdownSeconds = 2;
          _triggerCall112Dialog();
        }
      });
    });
  }

  void _cancelGuestCountdown() {
    _guestCountdownTimer?.cancel();
    if (mounted) {
      setState(() {
        _isGuestCountingDown = false;
        _guestCountdownSeconds = 2;
      });
    }
  }

  void _triggerCall112Dialog() {
    _guestCountdownTimer?.cancel();
    if (mounted) {
      setState(() {
        _isGuestCountingDown = false;
        _guestCountdownSeconds = 2;
      });
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Row(
          children: [
            Icon(Icons.phone_in_talk, color: AppColors.emergencyRed, size: 26),
            SizedBox(width: 10),
            Text(
              'Calling 112...',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.emergencyRed,
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Connecting to National Emergency Response Support System (112).\n\nDirect emergency dispatch line activated for guest user.',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFECACA)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.wifi_calling_3, color: AppColors.emergencyRed, size: 18),
                  SizedBox(width: 8),
                  Text(
                    'Emergency Line Active',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.emergencyRed,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          ElevatedButton.icon(
            onPressed: () => Navigator.of(ctx).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.emergencyRed,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            ),
            icon: const Icon(Icons.call_end, size: 18),
            label: const Text(
              'End Call',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  void _toggleEmergencySound() {
    setState(() {
      _isSoundPlaying = !_isSoundPlaying;
    });

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              _isSoundPlaying ? Icons.volume_up : Icons.volume_off,
              color: Colors.white,
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _isSoundPlaying
                    ? 'Siren activated! Playing loud emergency sound.'
                    : 'Emergency sound stopped.',
              ),
            ),
          ],
        ),
        action: _isSoundPlaying
            ? SnackBarAction(
                label: 'CANCEL',
                textColor: Colors.yellowAccent,
                onPressed: _toggleEmergencySound,
              )
            : null,
        backgroundColor:
            _isSoundPlaying ? AppColors.emergencySoundOrange : AppColors.primaryNavy,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  void _showDemoModeSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Demo Mode',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primaryNavy,
                  ),
                ),
                InkWell(
                  onTap: () => Navigator.of(ctx).pop(),
                  borderRadius: BorderRadius.circular(20),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: const BoxDecoration(
                      color: Color(0xFFF1F5F9),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.close_rounded, size: 18, color: AppColors.textMuted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            InkWell(
              onTap: () {
                Navigator.of(ctx).pop();
                showDialog(
                  context: context,
                  builder: (dialogCtx) => AlertDialog(
                    backgroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                    title: const Row(
                      children: [
                        Icon(Icons.warning_amber_rounded, color: Color(0xFFB91C1C), size: 24),
                        SizedBox(width: 8),
                        Text(
                          'No Contacts Added',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF1E293B),
                          ),
                        ),
                      ],
                    ),
                    content: const Text(
                      'No contacts added',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(dialogCtx).pop(),
                        child: const Text(
                          'OK',
                          style: TextStyle(color: AppColors.emergencyRed, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                );
              },
              borderRadius: BorderRadius.circular(18),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: const BoxDecoration(
                        color: Color(0xFFE50914),
                        borderRadius: BorderRadius.all(Radius.circular(14)),
                      ),
                      child: const Icon(Icons.shield_outlined, color: Colors.white, size: 24),
                    ),
                    const SizedBox(width: 14),
                    const Text(
                      'SOS Test',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: () {
                Navigator.of(ctx).pop();
                _toggleEmergencySound();
              },
              borderRadius: BorderRadius.circular(18),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: _isSoundPlaying ? const Color(0xFFDC2626) : const Color(0xFFE2E8F0),
                    width: _isSoundPlaying ? 1.5 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: _isSoundPlaying ? const Color(0xFFDC2626) : const Color(0xFFFF521D),
                        borderRadius: const BorderRadius.all(Radius.circular(14)),
                      ),
                      child: Icon(
                        _isSoundPlaying ? Icons.volume_up : Icons.volume_up_rounded,
                        color: Colors.white,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _isSoundPlaying ? 'Emergency Sound (Playing)' : 'Emergency Sound',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                          if (_isSoundPlaying)
                            const Text(
                              'Tap to cancel sound',
                              style: TextStyle(
                                fontSize: 11,
                                color: Color(0xFFDC2626),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (_isSoundPlaying)
                      ElevatedButton(
                        onPressed: () {
                          Navigator.of(ctx).pop();
                          _toggleEmergencySound();
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFDC2626),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('Cancel', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FC),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18.0, vertical: 10.0),
          child: Column(
            children: [
              // Top Bar
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: AppColors.primaryNavy, size: 22),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 6),
                      const Icon(
                        Icons.shield_outlined,
                        color: AppColors.emergencyRed,
                        size: 20,
                      ),
                      const SizedBox(width: 6),
                      const Text(
                        'Sos',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primaryNavy,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      IconButton(
                        icon: const Icon(
                          Icons.history,
                          color: AppColors.primaryNavy,
                          size: 22,
                        ),
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (context) => const HistoryScreen()),
                          );
                        },
                      ),
                      IconButton(
                        icon: const Icon(
                          Icons.settings_outlined,
                          color: AppColors.primaryNavy,
                          size: 22,
                        ),
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (context) => const SettingsScreen()),
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),

              const SizedBox(height: 6),

              // Demo Pill
              GestureDetector(
                onTap: _showDemoModeSheet,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8EEF5),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.play_arrow, size: 13, color: AppColors.demoPillText),
                      SizedBox(width: 4),
                      Text(
                        'Demo',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.demoPillText,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 14),

              // Main Peach Card: "No Contacts Added" (Matches Image 4)
              Expanded(
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF19B9B),
                    borderRadius: BorderRadius.circular(32),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFF19B9B).withValues(alpha: 0.35),
                        blurRadius: 20,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Spacer(flex: 2),

                      // "No Contacts Added" with Red Warning Icon
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.warning_amber_rounded,
                            color: Color(0xFFB91C1C),
                            size: 22,
                          ),
                          SizedBox(width: 8),
                          Text(
                            'No Contacts Added',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF1E293B),
                              letterSpacing: -0.3,
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 16),

                      // CALL 112 Red Button
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24.0),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: _triggerCall112Dialog,
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                              decoration: BoxDecoration(
                                color: const Color(0xFFDC2626),
                                borderRadius: BorderRadius.circular(20),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFFDC2626).withValues(alpha: 0.35),
                                    blurRadius: 10,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 38,
                                    height: 38,
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(alpha: 0.2),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.phone,
                                      color: Colors.white,
                                      size: 20,
                                    ),
                                  ),
                                  const SizedBox(width: 14),
                                  const Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'CALL 112',
                                          style: TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w900,
                                            color: Colors.white,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                        SizedBox(height: 2),
                                        Text(
                                          'Direct emergency line (tel:112)',
                                          style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w500,
                                            color: Colors.white70,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),

                      const Spacer(flex: 2),

                      // Circular 2S Trigger Button
                      GestureDetector(
                        onTap: _startGuest2sTrigger,
                        child: Container(
                          width: 110,
                          height: 110,
                          decoration: BoxDecoration(
                            color: const Color(0xFF222B38),
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: (_isGuestCountingDown
                                        ? const Color(0xFFDC2626)
                                        : Colors.black)
                                    .withValues(alpha: 0.25),
                                blurRadius: _isGuestCountingDown ? 24 : 16,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          padding: const EdgeInsets.all(12),
                          child: Container(
                            decoration: BoxDecoration(
                              color: _isGuestCountingDown
                                  ? const Color(0xFFDC2626)
                                  : const Color(0xFFEF4444),
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    _isGuestCountingDown
                                        ? '${_guestCountdownSeconds}S'
                                        : '2S',
                                    style: const TextStyle(
                                      fontSize: 26,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.white,
                                      letterSpacing: -0.5,
                                    ),
                                  ),
                                  if (_isGuestCountingDown)
                                    const Text(
                                      'CANCEL',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                        color: Colors.white70,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(height: 12),

                      Text(
                        _isGuestCountingDown
                            ? 'Auto-calling 112 in ${_guestCountdownSeconds}s (Tap circle to cancel)'
                            : 'Tap 2S to connect to 112',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: _isGuestCountingDown
                              ? const Color(0xFF991B1B)
                              : const Color(0xFF475569),
                        ),
                      ),

                      const Spacer(flex: 3),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 14),

              // Bottom Emergency Sound Card
              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: _toggleEmergencySound,
                  borderRadius: BorderRadius.circular(24),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14.0),
                    decoration: BoxDecoration(
                      color: const Color(0xFF222B38),
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.1),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 58,
                          height: 58,
                          decoration: BoxDecoration(
                            color: _isSoundPlaying
                                ? const Color(0xFFFF2200)
                                : const Color(0xFFFF521D),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Icon(
                            _isSoundPlaying ? Icons.volume_up : Icons.volume_up_rounded,
                            color: Colors.white,
                            size: 28,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _isSoundPlaying ? 'Playing Sound...' : 'Emergency Sound',
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                  letterSpacing: -0.2,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                _isSoundPlaying
                                    ? 'Tap Cancel or card to stop siren'
                                    : 'Play a loud emergency sound',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w400,
                                  color: Colors.white.withValues(alpha: 0.65),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_isSoundPlaying) ...[
                          const SizedBox(width: 8),
                          ElevatedButton.icon(
                            onPressed: _toggleEmergencySound,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFDC2626),
                              foregroundColor: Colors.white,
                              elevation: 2,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            icon: const Icon(Icons.stop_circle_outlined, size: 16, color: Colors.white),
                            label: const Text(
                              'Cancel',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 6),
            ],
          ),
        ),
      ),
    );
  }
}
