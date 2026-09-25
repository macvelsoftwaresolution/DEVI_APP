import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../services/location_service.dart';
import '../services/sms_service.dart';
import '../services/sound_service.dart';
import '../theme/app_colors.dart';
import 'history_screen.dart';
import 'settings_screen.dart';

typedef NoContactsScreen = GuestScreen;

class GuestScreen extends StatefulWidget {
  final bool autoStartCountdown;
  const GuestScreen({super.key, this.autoStartCountdown = true});

  @override
  State<GuestScreen> createState() => _GuestScreenState();
}

class _GuestScreenState extends State<GuestScreen> {
  final AppState _appState = AppState.instance;
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
    SoundService.instance.stopSiren();
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
          _triggerSosAlert();
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

  void _triggerSosAlert() async {
    _guestCountdownTimer?.cancel();
    if (mounted) {
      setState(() {
        _isGuestCountingDown = false;
        _guestCountdownSeconds = 2;
      });
    }

    final guardiansList = _appState.guardians;

    // If contacts are added by the user:
    if (guardiansList.isNotEmpty) {
      final primary = guardiansList.first;
      final primaryName = primary.name.trim().isNotEmpty ? primary.name.trim() : 'Guardian 1';
      final primaryPhone = primary.phone;

      final locResult = await LocationService.getCurrentLocation();
      final contactStrings = guardiansList.map((g) => '${g.name} (${g.phone})').toList();

      final alertData = await ApiService.instance.triggerEmergencyAlert(
        userPhone: _appState.phone.isNotEmpty ? _appState.phone : 'Guest',
        location: locResult.mapsUrl ?? locResult.displayText,
        latitude: locResult.latitude,
        longitude: locResult.longitude,
        contactsAlerted: contactStrings,
      );

      final alertId = alertData != null && alertData['id'] != null
          ? alertData['id'].toString()
          : DateTime.now().millisecondsSinceEpoch.toString();

      final trackingUrl = (alertData != null && alertData['trackingUrl'] != null)
          ? alertData['trackingUrl'].toString()
          : (locResult.mapsUrl ?? 'https://maps.google.com/?q=${locResult.latitude ?? 13.0827},${locResult.longitude ?? 80.2707}');

      LocationService.startLiveTracking(alertId: alertId);

      final guardianPhones = guardiansList.map((g) => g.phone).toList();
      final smsCount = await SmsService.broadcastEmergencySms(
        phoneNumbers: guardianPhones,
        userName: _appState.name.isNotEmpty ? _appState.name : 'Guest User',
        location: trackingUrl,
      );

      // Call 1st guardian
      await SmsService.makePhoneCall(primaryPhone);

      if (!mounted) return;

      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.phone_in_talk, color: Colors.white, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '📞 Calling $primaryName (+91 $primaryPhone)... ${smsCount > 0 ? "$smsCount SMS sent." : ""}',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
            ],
          ),
          backgroundColor: const Color(0xFF1E2532),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 4),
        ),
      );
      return;
    }

    // Fallback if no contacts added yet:
    _triggerCall112Dialog();
  }

  void _triggerCall112Dialog() async {
    _guestCountdownTimer?.cancel();
    if (mounted) {
      setState(() {
        _isGuestCountingDown = false;
        _guestCountdownSeconds = 2;
      });
    }

    final hasGuardians = _appState.guardians.isNotEmpty;
    final targetPhone = hasGuardians ? _appState.guardians.first.phone : '112';
    final targetLabel = hasGuardians
        ? (_appState.guardians.first.name.trim().isNotEmpty
            ? _appState.guardians.first.name.trim()
            : 'Guardian 1')
        : 'Emergency 112';

    await SmsService.makePhoneCall(targetPhone);

    if (!mounted) return;

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.phone_in_talk, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '📞 Calling $targetLabel (${hasGuardians ? "+91 $targetPhone" : targetPhone})...',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
              ),
            ),
          ],
        ),
        backgroundColor: hasGuardians ? const Color(0xFF1E2532) : AppColors.emergencyRed,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  void _toggleEmergencySound() async {
    final playing = await SoundService.instance.toggleSiren();
    if (!mounted) return;
    setState(() {
      _isSoundPlaying = playing;
    });

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
  }

  void _showDemoModeSheet() {
    showModalBottomSheet(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              20,
              12,
              20,
              24 + MediaQuery.of(ctx).viewInsets.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Handle Bar
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

                // Title and Close Button
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
                        child: const Icon(
                          Icons.close_rounded,
                          size: 18,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 18),

                // Option 1: SOS Test Card
                InkWell(
                  onTap: () {
                    Navigator.of(ctx).pop();
                    _triggerSosAlert();
                  },
                  borderRadius: BorderRadius.circular(18),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.02),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
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
                          child: const Center(
                            child: Icon(
                              Icons.shield_outlined,
                              color: Colors.white,
                              size: 24,
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Text(
                          'SOS Test',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primaryNavy,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                // Option 2: Emergency Sound Card (Interactive Toggle Inside Sheet)
                InkWell(
                  onTap: () async {
                    final playing = await SoundService.instance.toggleSiren();
                    if (mounted) {
                      setState(() {
                        _isSoundPlaying = playing;
                      });
                      setSheetState(() {});
                    }
                  },
                  borderRadius: BorderRadius.circular(18),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: _isSoundPlaying ? const Color(0xFFFEF2F2) : Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: _isSoundPlaying ? const Color(0xFFDC2626) : const Color(0xFFE2E8F0),
                        width: _isSoundPlaying ? 1.5 : 1,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: _isSoundPlaying
                              ? const Color(0xFFDC2626).withValues(alpha: 0.15)
                              : Colors.black.withValues(alpha: 0.02),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 250),
                          width: 46,
                          height: 46,
                          decoration: BoxDecoration(
                            color: _isSoundPlaying ? const Color(0xFFDC2626) : const Color(0xFFFF521D),
                            borderRadius: const BorderRadius.all(Radius.circular(14)),
                          ),
                          child: Center(
                            child: Icon(
                              _isSoundPlaying ? Icons.volume_up : Icons.volume_up_rounded,
                              color: Colors.white,
                              size: 24,
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    _isSoundPlaying ? 'Siren Playing...' : 'Emergency Sound',
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                      color: _isSoundPlaying ? const Color(0xFFDC2626) : AppColors.primaryNavy,
                                    ),
                                  ),
                                  if (_isSoundPlaying) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      width: 8,
                                      height: 8,
                                      decoration: const BoxDecoration(
                                        color: Color(0xFFDC2626),
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                _isSoundPlaying
                                    ? 'Tap to stop siren'
                                    : 'Tap to test loud siren',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: _isSoundPlaying ? const Color(0xFFDC2626) : AppColors.textMuted,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: _isSoundPlaying ? const Color(0xFFDC2626) : const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                _isSoundPlaying ? Icons.stop_circle_outlined : Icons.play_arrow_rounded,
                                size: 14,
                                color: _isSoundPlaying ? Colors.white : AppColors.primaryNavy,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                _isSoundPlaying ? 'STOP' : 'TEST',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: _isSoundPlaying ? Colors.white : AppColors.primaryNavy,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 6),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final screenWidth = mediaQuery.size.width;
    final screenHeight = mediaQuery.size.height;
    final isSmallScreen = screenWidth < 360;
    final isShortScreen = screenHeight < 680;
    final horizontalPad = isSmallScreen ? 12.0 : 18.0;
    final circleOuterSize = isShortScreen ? 96.0 : (isSmallScreen ? 104.0 : 116.0);
    final circleTextSize = isShortScreen ? 22.0 : 26.0;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FC),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: horizontalPad, vertical: isShortScreen ? 6.0 : 10.0),
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

                  SizedBox(height: isShortScreen ? 4 : 6),

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

                  SizedBox(height: isShortScreen ? 8 : 14),

                  // Main Peach Card: "No Contacts Added" (Matches Image 4)
                  Expanded(
                    child: Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: const Color(0xFFF19B9B),
                        borderRadius: BorderRadius.circular(28),
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
                          Builder(
                            builder: (context) {
                              final hasGuardians = _appState.guardians.isNotEmpty;
                              final primaryG = hasGuardians ? _appState.guardians.first : null;
                              final callBtnLabel = hasGuardians
                                  ? 'CALL ${primaryG!.name.trim().isNotEmpty ? primaryG.name.trim().toUpperCase() : "GUARDIAN"}'
                                  : 'CALL 112';
                              final callBtnSub = hasGuardians
                                  ? 'Primary contact (+91 ${primaryG!.phone})'
                                  : 'Direct emergency line (tel:112)';

                              return Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        hasGuardians ? Icons.verified_user : Icons.warning_amber_rounded,
                                        color: hasGuardians ? const Color(0xFF15803D) : const Color(0xFFB91C1C),
                                        size: 22,
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        hasGuardians ? 'Primary Contact Ready' : 'No Contacts Added',
                                        style: TextStyle(
                                          fontSize: isSmallScreen ? 16 : 18,
                                          fontWeight: FontWeight.w800,
                                          color: const Color(0xFF1E293B),
                                          letterSpacing: -0.3,
                                        ),
                                      ),
                                    ],
                                  ),

                                  SizedBox(height: isShortScreen ? 10 : 16),

                                  // CALL Red Button (Calls 1st Guardian if available, else 112)
                                  Padding(
                                    padding: EdgeInsets.symmetric(horizontal: isSmallScreen ? 14.0 : 24.0),
                                    child: Material(
                                      color: Colors.transparent,
                                      child: InkWell(
                                        onTap: _triggerCall112Dialog,
                                        borderRadius: BorderRadius.circular(20),
                                        child: Container(
                                          width: double.infinity,
                                          padding: EdgeInsets.symmetric(
                                            vertical: isShortScreen ? 10 : 12,
                                            horizontal: isSmallScreen ? 12 : 16,
                                          ),
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
                                                width: 36,
                                                height: 36,
                                                decoration: BoxDecoration(
                                                  color: Colors.white.withValues(alpha: 0.2),
                                                  shape: BoxShape.circle,
                                                ),
                                                child: const Icon(
                                                  Icons.phone,
                                                  color: Colors.white,
                                                  size: 19,
                                                ),
                                              ),
                                              const SizedBox(width: 12),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      callBtnLabel,
                                                      style: TextStyle(
                                                        fontSize: isSmallScreen ? 14.5 : 16,
                                                        fontWeight: FontWeight.w900,
                                                        color: Colors.white,
                                                        letterSpacing: 0.5,
                                                      ),
                                                    ),
                                                    const SizedBox(height: 2),
                                                    Text(
                                                      callBtnSub,
                                                      style: TextStyle(
                                                        fontSize: isSmallScreen ? 10 : 11,
                                                        fontWeight: FontWeight.w500,
                                                        color: Colors.white70,
                                                      ),
                                                      overflow: TextOverflow.ellipsis,
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
                                ],
                              );
                            },
                          ),

                          const Spacer(flex: 2),

                          // Circular 2S Trigger Button
                          GestureDetector(
                            onTap: _startGuest2sTrigger,
                            child: Container(
                              width: circleOuterSize,
                              height: circleOuterSize,
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
                                        style: TextStyle(
                                          fontSize: circleTextSize,
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

                          SizedBox(height: isShortScreen ? 8 : 12),

                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16.0),
                            child: Text(
                              _isGuestCountingDown
                                  ? 'Auto-calling 112 in ${_guestCountdownSeconds}s (Tap circle to cancel)'
                                  : 'Tap 2S to connect to 112',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: isSmallScreen ? 11 : 12,
                                fontWeight: FontWeight.w700,
                                color: _isGuestCountingDown
                                    ? const Color(0xFF991B1B)
                                    : const Color(0xFF475569),
                              ),
                            ),
                          ),

                          const Spacer(flex: 3),
                        ],
                      ),
                    ),
                  ),

                  SizedBox(height: isShortScreen ? 8 : 14),

                  // Bottom Emergency Sound Card (Interactive Toggle Highlight)
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: _toggleEmergencySound,
                      borderRadius: BorderRadius.circular(24),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeInOut,
                        width: double.infinity,
                        padding: EdgeInsets.all(isSmallScreen ? 11.0 : 14.0),
                        decoration: BoxDecoration(
                          gradient: _isSoundPlaying
                              ? const LinearGradient(
                                  colors: [Color(0xFFDC2626), Color(0xFF991B1B)],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                )
                              : null,
                          color: _isSoundPlaying ? null : const Color(0xFF222B38),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(
                            color: _isSoundPlaying
                                ? const Color(0xFFFCA5A5)
                                : const Color(0xFF334155),
                            width: _isSoundPlaying ? 2.0 : 1.0,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: _isSoundPlaying
                                  ? const Color(0xFFDC2626).withValues(alpha: 0.45)
                                  : Colors.black.withValues(alpha: 0.12),
                              blurRadius: _isSoundPlaying ? 18 : 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Row(
                          children: [
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 250),
                              width: isSmallScreen ? 48 : 56,
                              height: isSmallScreen ? 48 : 56,
                              decoration: BoxDecoration(
                                color: _isSoundPlaying
                                    ? Colors.white
                                    : const Color(0xFFFF521D),
                                borderRadius: BorderRadius.circular(16),
                                boxShadow: [
                                  BoxShadow(
                                    color: (_isSoundPlaying
                                            ? Colors.white
                                            : const Color(0xFFFF521D))
                                        .withValues(alpha: 0.35),
                                    blurRadius: 8,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: Icon(
                                _isSoundPlaying ? Icons.volume_up : Icons.volume_up_rounded,
                                color: _isSoundPlaying
                                    ? const Color(0xFFDC2626)
                                    : Colors.white,
                                size: isSmallScreen ? 24 : 28,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        _isSoundPlaying
                                            ? 'Siren Playing...'
                                            : 'Emergency Sound',
                                        style: TextStyle(
                                          fontSize: isSmallScreen ? 14 : 15,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.white,
                                          letterSpacing: -0.2,
                                        ),
                                      ),
                                      if (_isSoundPlaying) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          width: 8,
                                          height: 8,
                                          decoration: const BoxDecoration(
                                            color: Colors.yellowAccent,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    _isSoundPlaying
                                        ? 'Tap card to stop siren'
                                        : 'Tap to sound loud siren',
                                    style: TextStyle(
                                      fontSize: isSmallScreen ? 11 : 12,
                                      fontWeight: FontWeight.w500,
                                      color: _isSoundPlaying
                                          ? Colors.white.withValues(alpha: 0.9)
                                          : Colors.white.withValues(alpha: 0.65),
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: _isSoundPlaying
                                    ? Colors.white
                                    : Colors.white.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: _isSoundPlaying
                                      ? Colors.white
                                      : Colors.white.withValues(alpha: 0.2),
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    _isSoundPlaying
                                        ? Icons.stop_circle
                                        : Icons.play_arrow_rounded,
                                    size: 16,
                                    color: _isSoundPlaying
                                        ? const Color(0xFFDC2626)
                                        : Colors.white,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    _isSoundPlaying ? 'STOP' : 'PLAY',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                      color: _isSoundPlaying
                                          ? const Color(0xFFDC2626)
                                          : Colors.white,
                                      letterSpacing: 0.4,
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

                  SizedBox(height: isShortScreen ? 2 : 6),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
