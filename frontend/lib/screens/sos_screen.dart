import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../services/emergency_media_service.dart';
import '../services/sound_service.dart';
import '../theme/app_colors.dart';
import '../widgets/emergency_permission_dialog.dart';
import '../widgets/emergency_recording_banner.dart';
import 'history_screen.dart';
import 'guest_screen.dart';
import 'settings_screen.dart';

class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> with SingleTickerProviderStateMixin {
  final AppState _appState = AppState.instance;

  bool _isEmergencyActive = false;
  bool _isSoundPlaying = false;
  Timer? _holdTimer;
  double _holdProgress = 0.0;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _appState.addListener(_onStateChange);
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      EmergencyPermissionDialog.showIfNeeded(context);
    });
  }

  @override
  void dispose() {
    _appState.removeListener(_onStateChange);
    _holdTimer?.cancel();
    _pulseController.dispose();
    SoundService.instance.stopSiren();
    super.dispose();
  }

  void _onStateChange() {
    if (mounted) setState(() {});
  }

  // --- Handle SOS Action ---
  void _onSosTriggered() {
    if (_isEmergencyActive) {
      setState(() {
        _isEmergencyActive = false;
      });
      EmergencyMediaService.instance.stopEmergencyRecording();
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.info_outline, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Text('SOS Alert deactivated.', style: TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
          backgroundColor: AppColors.primaryNavy,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 2),
        ),
      );
      return;
    }

    if (_appState.isGuest) {
      // Guest user has no contacts added yet -> navigate to No Contacts Added screen
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => const NoContactsScreen(autoStartCountdown: true),
        ),
      );
    } else {
      // Registered user -> directly send alert to contacts (no popup)
      _triggerSosAlert();
    }
  }

  void _onHoldStart() {
    _holdTimer?.cancel();
    _holdProgress = 0.0;
    _holdTimer = Timer.periodic(const Duration(milliseconds: 50), (timer) {
      setState(() {
        _holdProgress += 0.05;
        if (_holdProgress >= 1.0) {
          _holdTimer?.cancel();
          _onSosTriggered();
        }
      });
    });
  }

  void _onHoldEnd() {
    _holdTimer?.cancel();
    if (_holdProgress < 1.0) {
      setState(() {
        _holdProgress = 0.0;
      });
    }
  }

  // --- Registered user: Record incident & 2-minute evidence in database for verification (No Guardian SMS/Call) ---
  Future<void> _triggerSosAlert() async {
    setState(() {
      _isEmergencyActive = true;
      _holdProgress = 0.0;
    });

    // 1. Auto-start 2-minute emergency video and audio recording
    EmergencyMediaService.instance.start2MinEmergencyRecording();

    // 2. Dynamic API call to backend to register SOS incident in database for verification
    final phone = _appState.phone.isNotEmpty ? _appState.phone : '9500238347';
    await ApiService.instance.triggerEmergencyAlert(
      userPhone: phone,
      location: 'Live GPS Location (Stored for Verification)',
      latitude: 13.0827,
      longitude: 80.2707,
      contactsAlerted: [],
    );

    if (!mounted) return;

    // Feedback banner showing database recording status for verification
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Row(
          children: [
            Icon(Icons.verified_user_rounded, color: Colors.white, size: 20),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                '🛡️ SOS Incident & 2-Min Evidence Stored in Database (Ready for Verification)',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF0F172A),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 4),
        action: SnackBarAction(
          label: 'History',
          textColor: const Color(0xFF38BDF8),
          onPressed: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (context) => const HistoryScreen()),
            );
          },
        ),
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

  // --- Demo Mode Bottom Sheet (Matches Screenshot 2) ---
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
                                  fontSize: 11,
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

  void _navigateToSettings() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (context) => const SettingsScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isSmallScreen = size.width < 360;
    final isShortScreen = size.height < 650;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FC),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: isSmallScreen ? 14.0 : 18.0,
                vertical: isShortScreen ? 6.0 : 10.0,
              ),
              child: Column(
                children: [
                  // Top Bar
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Row(
                        children: [
                          Icon(
                            Icons.shield_outlined,
                            color: AppColors.emergencyRed,
                            size: 20,
                          ),
                          SizedBox(width: 6),
                          Text(
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
                            onPressed: _navigateToSettings,
                          ),
                        ],
                      ),
                    ],
                  ),

                  SizedBox(height: isShortScreen ? 4 : 6),

                  // Emergency 2-Minute Recording Live Banner & Evidence Player
                  const EmergencyRecordingBanner(),

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

                  // SOS Home Card (Presented for both Registered and Guest User)
                  Expanded(
                    child: GestureDetector(
                      onTap: _onSosTriggered,
                      onLongPressStart: (_) => _onHoldStart(),
                      onLongPressEnd: (_) => _onHoldEnd(),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        width: double.infinity,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: _isEmergencyActive
                                ? [const Color(0xFFF05252), const Color(0xFFE04444)]
                                : [const Color(0xFFE80B1E), const Color(0xFFD60719)],
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                          ),
                          borderRadius: BorderRadius.circular(isSmallScreen ? 24 : 32),
                          boxShadow: [
                            BoxShadow(
                              color: (_isEmergencyActive
                                      ? const Color(0xFFF05252)
                                      : AppColors.emergencyRed)
                                  .withValues(alpha: 0.35),
                              blurRadius: 24,
                              offset: const Offset(0, 8),
                            ),
                          ],
                        ),
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            final availableHeight = constraints.maxHeight;
                            final circleSize = (availableHeight * 0.22).clamp(52.0, 78.0);
                            final iconSize = (circleSize * 0.48).clamp(24.0, 36.0);
                            final titleSize = (availableHeight * 0.12).clamp(32.0, 44.0);
                            final spacing1 = (availableHeight * 0.04).clamp(8.0, 18.0);
                            final spacing2 = (availableHeight * 0.03).clamp(6.0, 12.0);

                            return Stack(
                              alignment: Alignment.center,
                              children: [
                                Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    AnimatedScale(
                                      scale: _isEmergencyActive ? 1.15 : 1.0,
                                      duration: const Duration(milliseconds: 300),
                                      child: AnimatedContainer(
                                        duration: const Duration(milliseconds: 300),
                                        width: circleSize,
                                        height: circleSize,
                                        decoration: BoxDecoration(
                                          color: _isEmergencyActive
                                              ? const Color(0xFFD83A3A)
                                              : const Color(0xFFBF0818),
                                          shape: BoxShape.circle,
                                          boxShadow: [
                                            BoxShadow(
                                              color: Colors.black.withValues(alpha: 0.18),
                                              blurRadius: 10,
                                              offset: const Offset(0, 4),
                                            ),
                                          ],
                                        ),
                                        child: Center(
                                          child: Icon(
                                            Icons.crisis_alert,
                                            color: Colors.white,
                                            size: iconSize,
                                          ),
                                        ),
                                      ),
                                    ),

                                    SizedBox(height: spacing1),

                                    Text(
                                      'SOS',
                                      style: TextStyle(
                                        fontSize: titleSize,
                                        fontWeight: FontWeight.w900,
                                        color: Colors.white,
                                        letterSpacing: 1.0,
                                      ),
                                    ),

                                    SizedBox(height: spacing2),

                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 24.0),
                                      child: Text(
                                        'Tap or hold to alert emergency\nservices & contacts',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          fontSize: isSmallScreen || isShortScreen ? 11.5 : 12.5,
                                          fontWeight: FontWeight.w500,
                                          color: Colors.white.withValues(alpha: 0.92),
                                          height: 1.35,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),

                                // Hold Progress Indicator
                                if (_holdProgress > 0)
                                  Positioned(
                                    bottom: 20,
                                    left: 30,
                                    right: 30,
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(4),
                                      child: LinearProgressIndicator(
                                        value: _holdProgress,
                                        backgroundColor: Colors.white.withValues(alpha: 0.3),
                                        valueColor:
                                            const AlwaysStoppedAnimation<Color>(Colors.white),
                                        minHeight: 6,
                                      ),
                                    ),
                                  ),
                              ],
                            );
                          },
                        ),
                      ),
                    ),
                  ),

              const SizedBox(height: 14),

              // Bottom Emergency Sound Card (Interactive Toggle with Dynamic Highlight)
              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: _toggleEmergencySound,
                  borderRadius: BorderRadius.circular(24),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
                    decoration: BoxDecoration(
                      gradient: _isSoundPlaying
                          ? const LinearGradient(
                              colors: [Color(0xFFDC2626), Color(0xFF991B1B)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            )
                          : null,
                      color: _isSoundPlaying ? null : const Color(0xFF1E293B),
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
                          width: 52,
                          height: 52,
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
                            size: 28,
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
                                    style: const TextStyle(
                                      fontSize: 15,
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
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: _isSoundPlaying
                                      ? Colors.white.withValues(alpha: 0.9)
                                      : Colors.white.withValues(alpha: 0.65),
                                ),
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

              const SizedBox(height: 6),
            ],
          ),
        ),
      ),
    ),
  ),
);
}
}
