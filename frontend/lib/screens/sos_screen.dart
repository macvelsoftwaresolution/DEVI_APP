import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../services/emergency_foreground_service.dart';
import '../services/emergency_media_service.dart';
import '../services/location_service.dart';
import '../services/onboarding_service.dart';
import '../services/sms_service.dart';
import '../services/sound_service.dart';
import '../theme/app_colors.dart';
import '../widgets/emergency_sound_card.dart';
import '../widgets/location_prompt_dialog.dart';
import '../widgets/sign_in_prompt_sheet.dart';
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
  // True while the SOS has not reached the server yet (no internet); a retry loop is running
  bool _sosDeliveryPending = false;
  int _sosRetryAttempt = 0;
  // Set when the alert reached the server but WhatsApp did not reach some/all contacts
  String? _whatsappProblem;
  String? _whatsappCallPhone;
  String? _whatsappCallName;
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
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _ensureLocationOn();
      // A guest who tapped "Later" after their last SOS is asked once more, never during an SOS
      if (mounted && _appState.isGuest && !_isEmergencyActive &&
          await OnboardingService.takeSignInReminder() && mounted) {
        await showSignInPromptSheet(context, isReminder: true);
      }
    });
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
            'This will finish the emergency evidence and mark your alert as RESOLVED for the safety desk.',
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
      _sosDeliveryPending = false; // also stops the background retry loop
      _whatsappProblem = null;
      _whatsappCallPhone = null;
      _whatsappCallName = null;
    });
    _appState.clearActiveEmergency();

    // 1. Stop 2-minute emergency recording and finalize evidence upload
    await EmergencyMediaService.instance.stopEmergencyRecording();
    await EmergencyForegroundService.stop();

    // 2. Resolve the alert in the backend
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

    // Guests: offer sign in only now that they are safe, after a short pause
    if (_appState.isGuest) {
      await Future.delayed(const Duration(milliseconds: 2500));
      if (mounted && _appState.isGuest && !_isEmergencyActive) {
        await showSignInPromptSheet(context);
      }
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
      final guardiansList = _appState.guardians;
      final primaryGuardian = guardiansList.isNotEmpty ? guardiansList.first : null;
      final primaryPhone = primaryGuardian?.phone ?? '';

      // 2. Fetch current GPS location honestly with accuracy & timestamp
      final locResult = await LocationService.getCurrentLocation();
      final contactStrings = guardiansList.isEmpty
          ? ['112 National Police Emergency Helpline (Instant SOS)']
          : guardiansList.map((g) => '${g.name} (${g.phone})').toList();
      final guardianPhones = guardiansList.isEmpty
          ? ['112']
          : guardiansList.map((g) => g.phone).toList();

      final defaultUserName = isGuestMode
          ? 'Instant SOS User'
          : 'DEVI User';

      // 3. Register SOS alert in Backend with Idempotency Key & Trigger WhatsApp Dispatch.
      // The same idempotency key is reused on every retry, so the server never creates a
      // second alert or sends WhatsApp twice for one SOS.
      final idempotencyKey = _activeIdempotencyKey!;
      Future<Map<String, dynamic>?> sendSos(LocationResult loc) {
        return ApiService.instance.triggerEmergencyAlert(
          userPhone: _appState.phone.isNotEmpty ? _appState.phone : 'INSTANT_SOS',
          userName: _appState.name.isNotEmpty ? _appState.name : defaultUserName,
          location: loc.mapsUrl ?? loc.displayText,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          idempotencyKey: idempotencyKey,
          capturedAt: loc.capturedAt,
          contactsAlerted: contactStrings,
          emergencyContacts: guardianPhones,
        );
      }

      final alertData = await sendSos(locResult);
      final delivered = alertData != null && alertData['id'] != null;
      final isDuplicate = delivered && alertData['duplicate'] == true;

      // 4. Only a real server alert ID is used for evidence. If the server could
      // not be reached, nothing is bound yet: a background retry binds it once delivered.
      await recordingStarted;
      final alertId = delivered ? alertData['id'].toString() : initialId;
      _pressStartTime = null;
      if (delivered) {
        await _bindDeliveredAlert(alertId, whatsapp: alertData['whatsapp']);
      } else {
        _onSosDeliveryFailed();
        _retrySosDelivery(sendSos, idempotencyKey);
        _appState.setActiveEmergency(alertId);
      }

      // 5. Emergency Auto-Call: 112 is on HOLD per test request; routes directly to Web & WhatsApp!
      // The call goes out whether or not the server was reached (it uses the SIM, not internet).
      if (!isDuplicate) {
        if (primaryPhone.isEmpty) {
          // Direct 112 police call is put on HOLD for testing per user request!
          debugPrint('⏸️ [112 POLICE CALL ON HOLD] Real 112 call paused. Dispatched to Web Dashboard & WhatsApp.');
        } else {
          await SmsService.makePhoneCall(primaryPhone);
        }
      } else {
        debugPrint('🔁 [SOS RETRY/DUPLICATE] Active session reused. Skipping duplicate call.');
      }

      // 6. Hide the app (go to home screen) so the SOS is not visible on screen.
      // The call is launched first because Android blocks starting activities from the background.
      // If the alert did not reach the server, or WhatsApp did not reach someone,
      // stay on screen so the user sees the warning.
      if (delivered && _whatsappProblem == null) {
        await Future.delayed(const Duration(milliseconds: 800));
        await EmergencyForegroundService.minimizeApp();
      }
    } finally {
      _isSendingSos = false;
    }
  }

  // --- Attach evidence to the server's real alert ID (no live tracking: the SOS carries one location) ---
  Future<void> _bindDeliveredAlert(String alertId, {dynamic whatsapp}) async {
    _applyWhatsAppResult(whatsapp);
    EmergencyMediaService.instance.setAlertId(alertId);
    if (mounted) {
      setState(() {
        _activeAlertId = alertId;
        _sosDeliveryPending = false;
        _pressStartTime = null;
      });
    }
    _appState.setActiveEmergency(alertId);
    // Guests: keep proof of this alert so it moves to their account when they sign in
    _appState.rememberGuestAlert(alertId);
  }

  // --- Read the server's WhatsApp result and remember who was NOT reached ---
  void _applyWhatsAppResult(dynamic whatsapp) {
    String? problem;
    String? callPhone;
    String? callName;

    // No result (older server, or a retry that raced the first request): nothing to warn about
    if (whatsapp is Map && whatsapp['status'] != null && whatsapp['status'] != 'ALL_SENT') {
      final results = (whatsapp['results'] is List) ? whatsapp['results'] as List : const [];
      final failed = results.whereType<Map>().where((r) => r['sent'] != true).toList();
      final guardians = _appState.guardians;

      String last10(String p) {
        final d = p.replaceAll(RegExp(r'\D'), '');
        return d.length > 10 ? d.substring(d.length - 10) : d;
      }

      final failedNames = <String>[];
      for (final r in failed) {
        final phone = (r['phone'] ?? '').toString();
        final match = guardians.where((g) => last10(g.phone) == last10(phone)).toList();
        final name = match.isNotEmpty && match.first.name.trim().isNotEmpty
            ? match.first.name.trim()
            : (r['role'] == 'control_room' ? 'Emergency control room' : '+91 ${last10(phone)}');
        failedNames.add(name);
        if (callPhone == null && r['role'] != 'control_room') {
          callPhone = phone;
          callName = name;
        }
      }

      problem = whatsapp['status'] == 'NONE_SENT'
          ? 'Your alert was saved, but the WhatsApp message could not be sent to anyone. Call for help now.'
          : 'WhatsApp message did not reach ${failedNames.join(', ')}. Call them directly.';
      debugPrint('⚠️ [SOS WHATSAPP ${whatsapp['status']}] Not reached: ${failedNames.join(', ')}');
    }

    if (mounted) {
      setState(() {
        _whatsappProblem = problem;
        _whatsappCallPhone = callPhone;
        _whatsappCallName = callName;
      });
    } else {
      _whatsappProblem = problem;
      _whatsappCallPhone = callPhone;
      _whatsappCallName = callName;
    }
    if (problem != null) {
      // Three short buzzes = "not everyone was reached"
      () async {
        for (var i = 0; i < 3; i++) {
          await HapticFeedback.heavyImpact();
          await Future.delayed(const Duration(milliseconds: 250));
        }
      }();
    }
  }

  // --- Server unreachable: tell the user honestly instead of showing a false "sent" ---
  void _onSosDeliveryFailed() {
    debugPrint('❌ [SOS NOT DELIVERED] Server unreachable. Retrying in background.');
    if (mounted) {
      setState(() {
        _sosDeliveryPending = true;
        _sosRetryAttempt = 0;
      });
    }
    // Three short buzzes = "not sent yet"
    () async {
      for (var i = 0; i < 3; i++) {
        await HapticFeedback.heavyImpact();
        await Future.delayed(const Duration(milliseconds: 250));
      }
    }();
  }

  // --- Keep retrying with the same idempotency key until delivered or the user marks safe ---
  Future<void> _retrySosDelivery(
    Future<Map<String, dynamic>?> Function(LocationResult loc) sendSos,
    String idempotencyKey,
  ) async {
    const delaysSeconds = [3, 5, 10, 15, 30];
    var attempt = 0;
    bool stillPending() =>
        mounted &&
        _isEmergencyActive &&
        _activeAlertId == null &&
        _activeIdempotencyKey == idempotencyKey;

    while (stillPending()) {
      final wait = delaysSeconds[attempt < delaysSeconds.length ? attempt : delaysSeconds.length - 1];
      await Future.delayed(Duration(seconds: wait));
      if (!stillPending()) return;

      attempt++;
      if (mounted) setState(() => _sosRetryAttempt = attempt);
      debugPrint('🔁 [SOS RETRY] Attempt $attempt (key $idempotencyKey)');

      // Fresh GPS on each retry: the user may have moved or GPS may have come back
      final loc = await LocationService.getCurrentLocation();
      if (!stillPending()) return;
      final data = await sendSos(loc);
      if (data != null && data['id'] != null && stillPending()) {
        debugPrint('✅ [SOS DELIVERED ON RETRY] Attempt $attempt, Alert #${data['id']}');
        await _bindDeliveredAlert(data['id'].toString(), whatsapp: data['whatsapp']);
        if (_whatsappProblem != null) return; // the WhatsApp warning replaces the "sent" message
        // One long buzz = "sent"
        await HapticFeedback.vibrate();
        if (mounted) {
          ScaffoldMessenger.of(context).hideCurrentSnackBar();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Alert sent. Your guardians have been notified.', style: TextStyle(fontWeight: FontWeight.w700)),
              backgroundColor: Color(0xFF059669),
              behavior: SnackBarBehavior.floating,
              duration: Duration(seconds: 4),
            ),
          );
        }
        return;
      }
    }
  }

  // --- Direct call from the warning: the contact WhatsApp missed, else first guardian, else 112 ---
  String get _warningCallPhone {
    if (!_sosDeliveryPending && _whatsappCallPhone != null) return _whatsappCallPhone!;
    final guardians = _appState.guardians;
    return guardians.isNotEmpty ? guardians.first.phone : '112';
  }

  String get _warningCallLabel {
    if (!_sosDeliveryPending && _whatsappCallName != null) return 'Call $_whatsappCallName';
    final guardians = _appState.guardians;
    if (guardians.isEmpty) return 'Call 112';
    return guardians.first.name.trim().isNotEmpty ? 'Call ${guardians.first.name.trim()}' : 'Call guardian';
  }

  void _callForHelpDirectly() {
    SmsService.makePhoneCall(_warningCallPhone);
  }

  Widget _buildDeliveryWarning() {
    final callLabel = _warningCallLabel;
    final title = _sosDeliveryPending ? 'Alert not sent yet' : 'WhatsApp not delivered';
    final icon = _sosDeliveryPending ? Icons.wifi_off_rounded : Icons.sms_failed_rounded;
    final message = _sosDeliveryPending
        ? (_sosRetryAttempt == 0
            ? 'No internet connection. We will keep trying automatically. Call for help now.'
            : 'Still trying to send (attempt $_sosRetryAttempt). Call for help now.')
        : (_whatsappProblem ?? '');

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFCA5A5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: const Color(0xFFB91C1C), size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFFB91C1C)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            message,
            style: const TextStyle(fontSize: 13, height: 1.35, color: Color(0xFF7F1D1D)),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _callForHelpDirectly,
              icon: const Icon(Icons.call_rounded, size: 18),
              label: Text(callLabel, style: const TextStyle(fontWeight: FontWeight.w800)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ],
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
                  SosTopBar(
                    hasActiveAlert: _activeAlertId != null,
                    onHistoryTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (context) => const HistoryScreen()),
                    ),
                    onSettingsTap: _navigateToSettings,
                  ),

                  SizedBox(height: isShortScreen ? 10 : 16),

                  // Shown only when the SOS could not reach the server
                  if ((_sosDeliveryPending || _whatsappProblem != null) && _isEmergencyActive)
                    _buildDeliveryWarning(),

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
