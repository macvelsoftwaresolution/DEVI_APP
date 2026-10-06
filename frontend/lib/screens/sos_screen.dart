import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../services/emergency_media_service.dart';
import '../services/location_service.dart';
import '../services/sms_service.dart';
import '../services/sound_service.dart';
import '../theme/app_colors.dart';
import '../widgets/emergency_recording_banner.dart';
import 'history_screen.dart';
import 'settings_screen.dart';

class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> with SingleTickerProviderStateMixin {
  final AppState _appState = AppState.instance;

  bool _isEmergencyActive = false;
  bool _isSendingSos = false;
  String? _activeIdempotencyKey;
  String? _activeAlertId;
  bool _isSoundPlaying = false;
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
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
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
    // If triggered by a full 1.5s hold, ignore subsequent tap
    if (_didTriggerViaHold) {
      _didTriggerViaHold = false;
      return;
    }

    final holdDuration = _pressStartTime != null
        ? DateTime.now().difference(_pressStartTime!).inMilliseconds
        : 0;

    // If finger was held for > 350ms but not completed to 1.5s, it was an aborted hold
    if (holdDuration > 350) {
      return;
    }

    // If countdown is active, tapping cancels the false alarm immediately
    if (_isCountingDown) {
      _cancelSosCountdown();
      return;
    }

    if (_isEmergencyActive) {
      setState(() {
        _isEmergencyActive = false;
        _activeIdempotencyKey = null;
        _activeAlertId = null;
      });
      LocationService.stopLiveTracking(resolveBackend: true);
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.check_circle_outline, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Text('SOS Deactivated. Live tracking stopped.', style: TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
          backgroundColor: AppColors.primaryNavy,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 3),
        ),
      );
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
      final initialId = 'SOS_${DateTime.now().millisecondsSinceEpoch}';
      EmergencyMediaService.instance.start2MinEmergencyRecording(alertId: initialId);

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

      // 4. Start real-time continuous GPS tracking stream in background
      LocationService.startLiveTracking(alertId: alertId);

      if (mounted) {
        setState(() {
          _activeAlertId = alertId;
        });
      }

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

      if (!mounted) return;

      // Feedback banner showing database recording status for verification
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(
                isDuplicate ? Icons.sync_rounded : Icons.verified_user_rounded,
                color: Colors.white,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  isDuplicate
                      ? '🚨 Active SOS Resumed'
                      : (primaryPhone.isNotEmpty
                          ? '🛡️ SOS Incident & Evidence Recorded • Calling $primaryPhone'
                          : '🛡️ Emergency SOS Activated • Live Tracking Active'),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
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
    } finally {
      _isSendingSos = false;
    }
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

  void _showAddGuardianDialog() {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Row(
          children: [
            Icon(Icons.person_add_alt_1, color: AppColors.emergencyRed, size: 22),
            SizedBox(width: 8),
            Text(
              'Add Guardian',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.primaryNavy,
              ),
            ),
          ],
        ),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Guardian Name',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: nameController,
                textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(
                  hintText: 'Enter guardian name',
                  hintStyle: TextStyle(
                    color: AppColors.textMuted.withValues(alpha: 0.6),
                    fontSize: 14,
                  ),
                  floatingLabelBehavior: FloatingLabelBehavior.never,
                  filled: true,
                  fillColor: AppColors.inputFill,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.person_outline, size: 20, color: AppColors.textMuted),
                ),
                validator: (val) {
                  final text = val?.trim() ?? '';
                  if (text.isEmpty) return 'Please enter guardian name';
                  if (text.length < 2) return 'Name must be at least 2 characters';
                  if (!RegExp(r"^[a-zA-Z\s\.]+$").hasMatch(text)) {
                    return 'Name should only contain letters';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),
              const Text(
                'Mobile Number',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
                decoration: InputDecoration(
                  hintText: '9042024830',
                  hintStyle: TextStyle(
                    color: AppColors.textMuted.withValues(alpha: 0.6),
                    fontSize: 14,
                  ),
                  floatingLabelBehavior: FloatingLabelBehavior.never,
                  prefixText: '+91 ',
                  prefixStyle: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.textDark,
                  ),
                  filled: true,
                  fillColor: AppColors.inputFill,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.phone_outlined, size: 20, color: AppColors.textMuted),
                ),
                validator: (val) {
                  final phone = val?.trim() ?? '';
                  if (phone.isEmpty) return 'Please enter mobile number';
                  if (phone.length != 10) return 'Enter exactly 10 digits';
                  if (!RegExp(r'^[6-9]\d{9}$').hasMatch(phone)) {
                    return 'Starts with 6, 7, 8, or 9';
                  }
                  if (phone == _appState.phone) {
                    return 'Cannot be your own mobile number';
                  }
                  if (_appState.rawGuardians.any((g) => g.phone == phone)) {
                    return 'Guardian is already added';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          ElevatedButton(
            onPressed: () {
              if (formKey.currentState?.validate() ?? false) {
                _appState.addGuardian(
                  nameController.text.trim(),
                  phoneController.text.trim(),
                );
                Navigator.of(ctx).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('${nameController.text.trim()} added as guardian'),
                    backgroundColor: AppColors.primaryNavy,
                    duration: const Duration(seconds: 2),
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.emergencyRed,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: const Text('Add', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
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
                            icon: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                const Icon(
                                  Icons.history,
                                  color: AppColors.primaryNavy,
                                  size: 22,
                                ),
                                if (_activeAlertId != null)
                                  Positioned(
                                    top: -1,
                                    right: -1,
                                    child: Container(
                                      width: 9,
                                      height: 9,
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF0284C7),
                                        shape: BoxShape.circle,
                                        border: Border.all(color: Colors.white, width: 1.5),
                                      ),
                                    ),
                                  ),
                              ],
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
                      onTap: () {
                        if (_isCountingDown) {
                          _cancelSosCountdown();
                        } else {
                          _onSosTriggered();
                        }
                      },
                      onTapDown: (_) {
                        if (!_isCountingDown && !_isEmergencyActive) {
                          _onHoldStart();
                        }
                      },
                      onTapUp: (_) => _onHoldEnd(),
                      onTapCancel: _onHoldEnd,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        width: double.infinity,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: _isEmergencyActive
                                ? [const Color(0xFFF05252), const Color(0xFFE04444)]
                                : _isCountingDown
                                    ? [const Color(0xFFFF3366), const Color(0xFFCC0826)]
                                    : [const Color(0xFFE80B1E), const Color(0xFFD60719)],
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                          ),
                          borderRadius: BorderRadius.circular(isSmallScreen ? 24 : 32),
                          boxShadow: [
                            BoxShadow(
                              color: (_isEmergencyActive || _isCountingDown
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
                                      scale: (_isEmergencyActive || _isCountingDown)
                                          ? 1.15
                                          : _isHolding
                                              ? 0.94
                                              : 1.0,
                                      duration: const Duration(milliseconds: 200),
                                      child: Stack(
                                        alignment: Alignment.center,
                                        children: [
                                          // Circular Progress Ring when holding
                                          if (_holdProgress > 0)
                                            SizedBox(
                                              width: circleSize + 16,
                                              height: circleSize + 16,
                                              child: CircularProgressIndicator(
                                                value: _holdProgress,
                                                strokeWidth: 4.5,
                                                strokeCap: StrokeCap.round,
                                                valueColor:
                                                    const AlwaysStoppedAnimation<Color>(Colors.white),
                                                backgroundColor:
                                                    Colors.white.withValues(alpha: 0.25),
                                              ),
                                            ),
                                          AnimatedContainer(
                                            duration: const Duration(milliseconds: 200),
                                            width: circleSize,
                                            height: circleSize,
                                            decoration: BoxDecoration(
                                              color: _isEmergencyActive
                                                  ? const Color(0xFFD83A3A)
                                                  : _isCountingDown
                                                      ? Colors.white
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
                                              child: _isCountingDown
                                                  ? Text(
                                                      '${_countdownSeconds}s',
                                                      style: TextStyle(
                                                        fontSize: iconSize,
                                                        fontWeight: FontWeight.w900,
                                                        color: const Color(0xFFDC2626),
                                                      ),
                                                    )
                                                  : Icon(
                                                      Icons.crisis_alert,
                                                      color: Colors.white,
                                                      size: iconSize,
                                                    ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),

                                    SizedBox(height: spacing1),

                                    Text(
                                      _isHolding
                                          ? 'HOLDING FOR SOS'
                                          : _isCountingDown
                                              ? 'ALERT IN ${_countdownSeconds}S'
                                              : 'SOS',
                                      style: TextStyle(
                                        fontSize: (_isHolding || _isCountingDown)
                                            ? (titleSize * 0.72).clamp(24.0, 34.0)
                                            : titleSize,
                                        fontWeight: FontWeight.w900,
                                        color: Colors.white,
                                        letterSpacing: 1.0,
                                      ),
                                    ),

                                    SizedBox(height: spacing2),

                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 24.0),
                                      child: Text(
                                        _isHolding
                                            ? 'Keep holding to trigger SOS instantly\nRelease finger to cancel'
                                            : _isCountingDown
                                                ? 'Auto-dispatching alert in ${_countdownSeconds}s\nTap anywhere or press Cancel'
                                                : _isEmergencyActive
                                                    ? 'EMERGENCY ALERT ACTIVE\nTap to deactivate'
                                                    : 'Tap for 5s countdown or hold to trigger\nemergency contacts',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          fontSize: isSmallScreen || isShortScreen ? 11.5 : 12.5,
                                          fontWeight: FontWeight.w500,
                                          color: Colors.white.withValues(alpha: 0.92),
                                          height: 1.35,
                                        ),
                                      ),
                                    ),

                                    if (_isCountingDown) ...[
                                      SizedBox(height: spacing2),
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          GestureDetector(
                                            behavior: HitTestBehavior.opaque,
                                            onTap: _cancelSosCountdown,
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                              decoration: BoxDecoration(
                                                color: Colors.white,
                                                borderRadius: BorderRadius.circular(20),
                                                boxShadow: [
                                                  BoxShadow(
                                                    color: Colors.black.withValues(alpha: 0.2),
                                                    blurRadius: 6,
                                                    offset: const Offset(0, 2),
                                                  ),
                                                ],
                                              ),
                                              child: const Row(
                                                mainAxisSize: MainAxisSize.min,
                                                children: [
                                                  Icon(Icons.close, color: Color(0xFFDC2626), size: 16),
                                                  SizedBox(width: 4),
                                                  Text(
                                                    'CANCEL',
                                                    style: TextStyle(
                                                      fontSize: 12,
                                                      fontWeight: FontWeight.w800,
                                                      color: Color(0xFFDC2626),
                                                      letterSpacing: 0.5,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          GestureDetector(
                                            behavior: HitTestBehavior.opaque,
                                            onTap: _sendNow,
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                              decoration: BoxDecoration(
                                                color: Colors.white.withValues(alpha: 0.22),
                                                borderRadius: BorderRadius.circular(20),
                                                border: Border.all(color: Colors.white, width: 1.5),
                                              ),
                                              child: const Row(
                                                mainAxisSize: MainAxisSize.min,
                                                children: [
                                                  Icon(Icons.send_rounded, color: Colors.white, size: 15),
                                                  SizedBox(width: 4),
                                                  Text(
                                                    'SEND NOW',
                                                    style: TextStyle(
                                                      fontSize: 12,
                                                      fontWeight: FontWeight.w800,
                                                      color: Colors.white,
                                                      letterSpacing: 0.5,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ],
                                ),

                                // Hold Progress Indicator (Bottom Bar)
                                if (_holdProgress > 0)
                                  Positioned(
                                    bottom: 20,
                                    left: 40,
                                    right: 40,
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(4),
                                      child: LinearProgressIndicator(
                                        value: _holdProgress,
                                        backgroundColor: Colors.white.withValues(alpha: 0.25),
                                        valueColor:
                                            const AlwaysStoppedAnimation<Color>(Colors.white),
                                        minHeight: 5,
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
