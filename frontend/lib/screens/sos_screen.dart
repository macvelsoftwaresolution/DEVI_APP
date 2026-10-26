import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../services/emergency_foreground_service.dart';
import '../services/emergency_media_service.dart';
import '../services/location_service.dart';
import '../services/sms_service.dart';
import '../services/sound_service.dart';
import '../theme/app_colors.dart';
import '../widgets/emergency_sound_card.dart';
import '../widgets/location_prompt_dialog.dart';
import '../widgets/sos_action_card.dart';
import '../widgets/sos_guide_card.dart';
import '../widgets/sos_top_bar.dart';
import 'history_screen.dart';
import 'settings_screen.dart';

class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  final AppState _appState = AppState.instance;
  bool _isLocationPromptOpen = false;

  bool _isEmergencyActive = false;
  bool _isSendingSos = false;
  String? _activeIdempotencyKey;
  String? _activeAlertId;
  Timer? _holdTimer;
  double _holdProgress = 0.0;
  late AnimationController _pulseController;

  // --- False Alarm Prevention Countdown ---
  static const int _defaultCountdownSeconds = 5;
  Timer? _countdownTimer;
  int _countdownSeconds = _defaultCountdownSeconds;
  bool _isCountingDown = false;

  // --- Complete Press-and-Hold Animation State ---
  DateTime? _pressStartTime;
  bool _isHolding = false;
  bool _didTriggerViaHold = false;

  @override
  void initState() {
    super.initState();
    _appState.addListener(_onStateChange);
    WidgetsBinding.instance.addObserver(this);
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    if (_appState.isEmergencyActive) {
      _isEmergencyActive = true;
      _activeAlertId = _appState.activeAlertId;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _ensureLocationOn());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-check when the user comes back (e.g. from the location settings screen)
    if (state == AppLifecycleState.resumed) _ensureLocationOn();
  }

  // --- Location must stay on so an SOS can share where the user is ---
  Future<void> _ensureLocationOn() async {
    if (kIsWeb || _isLocationPromptOpen || !mounted) return;
    final readiness = await LocationService.checkReadiness();
    if (readiness == LocationReadiness.ready || !mounted) return;

    _isLocationPromptOpen = true;
    await showLocationPromptDialog(context, readiness);
    _isLocationPromptOpen = false;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _appState.removeListener(_onStateChange);
    _holdTimer?.cancel();
    _countdownTimer?.cancel();
    _pulseController.dispose();
    SoundService.instance.stopSiren();
    super.dispose();
  }

  void _onStateChange() {
    if (mounted) setState(() {});
  }

  // --- Handle SOS Action ---
  void _onSosTriggered() {
    // If emergency is currently active, tapping immediately triggers "I'M SAFE" resolution
    if (_isEmergencyActive) {
      _handleDeactivateSos();
      return;
    }

    // If triggered by a full 1.5s hold, ignore subsequent tap
    if (_didTriggerViaHold) {
      _didTriggerViaHold = false;
      return;
    }

    // If countdown is active, tapping cancels the false alarm immediately
    if (_isCountingDown) {
      _cancelSosCountdown();
      return;
    }

    final holdDuration = _pressStartTime != null
        ? DateTime.now().difference(_pressStartTime!).inMilliseconds
        : 0;

    // If finger was held for > 350ms but not completed to 1.5s, it was an aborted hold
    if (holdDuration > 350) {
      return;
    }

    // Both Registered and Guest users get the identical 5-second countdown with visual seconds display
    _startSosCountdown();
  }

  void _startSosCountdown() {
    if (!mounted) return;
    if (_isCountingDown) {
      _cancelSosCountdown();
      return;
    }

    setState(() {
      _isCountingDown = true;
      _countdownSeconds = _defaultCountdownSeconds;
      _holdProgress = 0.0;
      _isHolding = false;
    });

    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        if (_countdownSeconds > 1) {
          _countdownSeconds--;
        } else {
          _countdownTimer?.cancel();
          _isCountingDown = false;
          _countdownSeconds = _defaultCountdownSeconds;
          _triggerSosAlert();
        }
      });
    });
  }

  void _cancelSosCountdown() {
    _countdownTimer?.cancel();
    EmergencyMediaService.instance.reset();
    if (mounted) {
      setState(() {
        _isCountingDown = false;
        _countdownSeconds = _defaultCountdownSeconds;
      });
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.check_circle_outline, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Text('SOS cancelled. False alarm prevented.', style: TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
          backgroundColor: AppColors.primaryNavy,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  void _sendNow() {
    _countdownTimer?.cancel();
    setState(() {
      _isCountingDown = false;
      _countdownSeconds = _defaultCountdownSeconds;
    });
    _triggerSosAlert();
  }

  // --- Deactivate SOS / Mark as Safe Resolution ---
  Future<void> _handleDeactivateSos({bool showConfirmation = true}) async {
    if (!_isEmergencyActive && _activeAlertId == null) return;

    if (showConfirmation) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Row(
            children: [
              Icon(Icons.verified_user_rounded, color: Color(0xFF10B981), size: 24),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Are you safe now?',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.primaryNavy),
                ),
              ),
            ],
          ),
          content: const Text(
            'This will stop live GPS tracking, finalize emergency evidence, and mark your alert as RESOLVED for the safety desk.',
            style: TextStyle(fontSize: 13, color: Color(0xFF475569), height: 1.4),
          ),
          actionsPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF64748B))),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              ),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Yes, I Am Safe', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      );

      if (confirmed != true) return;
    }

    final alertId = _activeAlertId ?? _appState.activeAlertId;

    setState(() {
      _isEmergencyActive = false;
      _activeIdempotencyKey = null;
      _activeAlertId = null;
      _isHolding = false;
      _holdProgress = 0.0;
      _pressStartTime = null;
      _didTriggerViaHold = false;
    });
    _appState.clearActiveEmergency();

    // 1. Stop live GPS tracking and resolve in backend
    await LocationService.stopLiveTracking(resolveBackend: true);

    // 2. Stop 2-minute emergency recording and finalize evidence upload
    await EmergencyMediaService.instance.stopEmergencyRecording();
    await EmergencyForegroundService.stop();

    // 3. Directly call backend resolve if alertId was tracked
    if (alertId != null && alertId.isNotEmpty) {
      await ApiService.instance.resolveEmergencyAlert(alertId);
    }

    if (mounted) {
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.verified_rounded, color: Colors.white, size: 20),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Alert closed. You are marked safe.',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
            ],
          ),
          backgroundColor: const Color(0xFF059669),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  // --- Complete Press-and-Hold: Smooth 1.5s Hold with Circular Progress Feedback ---
  void _onHoldStart() {
    if (_isCountingDown || _isEmergencyActive) {
      return;
    }
    _pressStartTime = DateTime.now();
    _holdTimer?.cancel();
    _didTriggerViaHold = false;

    setState(() {
      _isHolding = true;
      _holdProgress = 0.0;
    });

    // 1500ms total duration, updates every 25ms (very smooth 60fps animation)
    _holdTimer = Timer.periodic(const Duration(milliseconds: 25), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _holdProgress += 25 / 1500;
        if (_holdProgress >= 1.0) {
          _holdTimer?.cancel();
          _isHolding = false;
          _holdProgress = 0.0;
          _didTriggerViaHold = true;
          // Completed 100% full hold -> immediate SOS trigger!
          _triggerSosAlert();
        }
      });
    });
  }

  void _onHoldEnd() {
    _holdTimer?.cancel();
    if (mounted) {
      setState(() {
        _isHolding = false;
        _holdProgress = 0.0;
      });
    }
  }

  // --- Registered user: Record incident & 2-minute evidence in database for verification ---
  Future<void> _triggerSosAlert() async {
    // 0. Double-tap and rapid click protection
    if (_isSendingSos) return;
    _isSendingSos = true;

    setState(() {
      _isEmergencyActive = true;
      _holdProgress = 0.0;
    });

    // Generate or reuse persistent UUID idempotency key for this session
    _activeIdempotencyKey ??= const Uuid().v4();

    try {
      // 1. Auto-start 2-minute emergency video and audio recording
      // (runs in parallel with the location fetch; on Android it also starts the SOS foreground service)
      final initialId = 'SOS_${DateTime.now().millisecondsSinceEpoch}';
      final recordingStarted = EmergencyMediaService.instance.start2MinEmergencyRecording(alertId: initialId);

      final isGuestMode = _appState.isGuest;
      final guardiansList = isGuestMode ? <GuardianModel>[] : _appState.guardians;
      final primaryGuardian = guardiansList.isNotEmpty ? guardiansList.first : null;
      final primaryPhone = isGuestMode ? '' : (primaryGuardian?.phone ?? '');

      // 2. Fetch current GPS location honestly with accuracy & timestamp
      final locResult = await LocationService.getCurrentLocation();
      final contactStrings = isGuestMode || guardiansList.isEmpty
          ? ['112 National Police Emergency Helpline (Instant SOS)']
          : guardiansList.map((g) => '${g.name} (${g.phone})').toList();
      final guardianPhones = isGuestMode || guardiansList.isEmpty
          ? ['112']
          : guardiansList.map((g) => g.phone).toList();

      final defaultUserName = isGuestMode
          ? 'Instant SOS User'
          : 'DEVI User';

      // 3. Register SOS alert in Backend with Idempotency Key & Trigger WhatsApp Dispatch
      final alertData = await ApiService.instance.triggerEmergencyAlert(
        userPhone: _appState.phone.isNotEmpty ? _appState.phone : 'INSTANT_SOS',
        userName: _appState.name.isNotEmpty ? _appState.name : defaultUserName,
        location: locResult.mapsUrl ?? locResult.displayText,
        latitude: locResult.latitude,
        longitude: locResult.longitude,
        accuracy: locResult.accuracy,
        idempotencyKey: _activeIdempotencyKey,
        capturedAt: locResult.capturedAt,
        contactsAlerted: contactStrings,
        emergencyContacts: guardianPhones,
      );

      final alertId = alertData != null && alertData['id'] != null
          ? alertData['id'].toString()
          : DateTime.now().millisecondsSinceEpoch.toString();

      final isDuplicate = alertData != null && alertData['duplicate'] == true;

      // Bind alert ID for automatic evidence upload to Cloudinary upon completion
      EmergencyMediaService.instance.setAlertId(alertId);

      // 4. Start real-time continuous GPS tracking stream in background.
      // Wait for the recording start so tracking can reuse the SOS foreground service.
      await recordingStarted;
      LocationService.startLiveTracking(alertId: alertId);
      await EmergencyForegroundService.setAlertContext(
        alertId: alertId,
        apiBaseUrl: ApiService.baseUrl,
        controlToken: ApiService.instance.sosControlToken(alertId),
      );

      if (mounted) {
        setState(() {
          _activeAlertId = alertId;
          _pressStartTime = null;
        });
      }
      _appState.setActiveEmergency(alertId);

      // 5. Emergency Auto-Call: 112 is on HOLD per test request; routes directly to Web & WhatsApp!
      if (!isDuplicate) {
        if (isGuestMode || primaryPhone.isEmpty) {
          // Direct 112 police call is put on HOLD for testing per user request!
          debugPrint('⏸️ [112 POLICE CALL ON HOLD] Real 112 call paused. Dispatched to Web Dashboard & WhatsApp.');
        } else {
          await SmsService.makePhoneCall(primaryPhone);
        }
      } else {
        debugPrint('🔁 [SOS RETRY/DUPLICATE] Active session reused ($alertId). Skipping duplicate call.');
      }

      // 6. Hide the app (go to home screen) so the SOS is not visible on screen.
      // The call is launched first because Android blocks starting activities from the background.
      await Future.delayed(const Duration(milliseconds: 800));
      await EmergencyForegroundService.minimizeApp();
    } finally {
      _isSendingSos = false;
    }
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
                  SosTopBar(
                    hasActiveAlert: _activeAlertId != null,
                    onHistoryTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const HistoryScreen()),
                    ),
                    onSettingsTap: _navigateToSettings,
                  ),

                  SizedBox(height: isShortScreen ? 10 : 16),

                  // SOS Guide Card (separate card above SOS)
                  SosGuideCard(
                    isEmergencyActive: _isEmergencyActive,
                    isCountingDown: _isCountingDown,
                    userName: _appState.name,
                  ),

                  const SizedBox(height: 12),

                  // SOS Home Card (Presented for both Registered and Guest User)
                  Expanded(
                    child: SosActionCard(
                      isEmergencyActive: _isEmergencyActive,
                      isCountingDown: _isCountingDown,
                      isHolding: _isHolding,
                      holdProgress: _holdProgress,
                      countdownSeconds: _countdownSeconds,
                      isSmallScreen: isSmallScreen,
                      isShortScreen: isShortScreen,
                      onTap: () => _isCountingDown ? _cancelSosCountdown() : _onSosTriggered(),
                      onPressStart: () {
                        if (!_isCountingDown && !_isEmergencyActive) _onHoldStart();
                      },
                      onPressEnd: _onHoldEnd,
                      onCancelCountdown: _cancelSosCountdown,
                      onSendNow: _sendNow,
                    ),
                  ),

              const SizedBox(height: 14),

              // Bottom Emergency Sound Card (Independent Reusable Widget)
              const EmergencySoundCard(),

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
