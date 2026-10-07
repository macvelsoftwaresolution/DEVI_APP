import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../widgets/location_card.dart';

class ResponderDutyScreen extends StatefulWidget {
  final String? initialToken;
  const ResponderDutyScreen({super.key, this.initialToken});

  @override
  State<ResponderDutyScreen> createState() => _ResponderDutyScreenState();
}

class _ResponderDutyScreenState extends State<ResponderDutyScreen> {
  // Auth & Profile
  bool _isLoading = false;
  bool _isOnDuty = false;
  String? _agentId;
  String? _agentName;
  String? _agentPhone;
  String? _agentArea;

  // Login controllers
  final _phoneController = TextEditingController();
  final _pinController = TextEditingController();
  String _errorMessage = '';

  // Shift & Tracking
  int _shiftHours = 8;
  DateTime? _shiftEndTime;
  Duration _remainingShift = Duration.zero;
  Timer? _countdownTimer;
  Timer? _assignmentPollTimer;

  // Live GPS telemetry
  double? _latitude;
  double? _longitude;
  double? _accuracy;
  double? _speed;

  // Active SOS Assignment
  Map<String, dynamic>? _activeAlert;

  @override
  void initState() {
    super.initState();
    _loadSavedSession();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _assignmentPollTimer?.cancel();
    _phoneController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _loadSavedSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedId = prefs.getString('devi_responder_id');
    final savedName = prefs.getString('devi_responder_name');
    final savedPhone = prefs.getString('devi_responder_phone');
    final savedArea = prefs.getString('devi_responder_area');
    final savedShiftEnd = prefs.getString('devi_shift_end_time');

    if (savedId != null && savedName != null) {
      setState(() {
        _agentId = savedId;
        _agentName = savedName;
        _agentPhone = savedPhone;
        _agentArea = savedArea;
      });

      if (savedShiftEnd != null) {
        final endTime = DateTime.tryParse(savedShiftEnd);
        if (endTime != null && endTime.isAfter(DateTime.now())) {
          _shiftEndTime = endTime;
          _startDutyMode(resume: true);
        }
      }
    }
  }

  Future<void> _loginResponder() async {
    final phone = _phoneController.text.trim().replaceAll(RegExp(r'\D'), '');
    final pin = _pinController.text.trim();

    if (phone.length < 10) {
      setState(() => _errorMessage = 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (pin.length < 4) {
      setState(() => _errorMessage = 'Please enter your 4-digit Security PIN');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final url = Uri.parse('${ApiService.baseUrl}/dashboard/duty/login');
      final res = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone, 'pin': pin}),
      ).timeout(const Duration(seconds: 8));

      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true && data['agent'] != null) {
        final agent = data['agent'];
        final id = agent['id'].toString();
        final name = agent['name'] ?? 'Responder';
        final area = agent['area'] ?? '';

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('devi_responder_id', id);
        await prefs.setString('devi_responder_name', name);
        await prefs.setString('devi_responder_phone', phone);
        await prefs.setString('devi_responder_area', area);

        setState(() {
          _agentId = id;
          _agentName = name;
          _agentPhone = phone;
          _agentArea = area;
        });

        _startDutyMode();
      } else {
        setState(() => _errorMessage = data['message'] ?? 'Invalid Mobile Number or Security PIN');
      }
    } catch (e) {
      setState(() => _errorMessage = 'Connection error: ${e.toString()}');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _startDutyMode({bool resume = false}) async {
    if (_agentId == null) return;

    if (!resume) {
      // Fetch system duty settings for shift hours
      try {
        final sUrl = Uri.parse('${ApiService.baseUrl}/dashboard/settings/duty');
        final sRes = await http.get(sUrl).timeout(const Duration(seconds: 4));
        final sData = jsonDecode(sRes.body);
        if (sData['success'] == true && sData['settings'] != null) {
          _shiftHours = (sData['settings']['shiftDurationHours'] ?? 8) as int;
        }
      } catch (_) {}

      _shiftEndTime = DateTime.now().add(Duration(hours: _shiftHours));
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('devi_shift_end_time', _shiftEndTime!.toIso8601String());
    }

    final success = await LocationService.startResponderDuty(
      agentId: _agentId!,
      agentName: _agentName ?? 'DEVI Responder',
      shiftHours: _shiftHours,
      intervalSeconds: 10,
      onUpdate: (Position pos) {
        if (mounted) {
          setState(() {
            _latitude = pos.latitude;
            _longitude = pos.longitude;
            _accuracy = pos.accuracy;
            _speed = pos.speed;
          });
        }
      },
      onShiftExpired: () {
        if (mounted) {
          _stopDutyMode();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('⏰ Duty shift completed! Going offline to preserve battery.'),
              backgroundColor: Colors.amber,
            ),
          );
        }
      },
    );

    if (success) {
      setState(() => _isOnDuty = true);

      // Notify backend that agent is actively ON_DUTY
      try {
        final dUrl = Uri.parse('${ApiService.baseUrl}/dashboard/agents/$_agentId/duty');
        await http.post(
          dUrl,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'status': 'ON_DUTY'}),
        ).timeout(const Duration(seconds: 4));
      } catch (_) {}

      // Start countdown ticker
      _countdownTimer?.cancel();
      _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (_shiftEndTime != null) {
          final diff = _shiftEndTime!.difference(DateTime.now());
          if (diff.isNegative) {
            timer.cancel();
            _stopDutyMode();
          } else {
            if (mounted) {
              setState(() => _remainingShift = diff);
            }
          }
        }
      });

      // Poll for active SOS assignment
      _assignmentPollTimer?.cancel();
      _assignmentPollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _checkForAssignments());
      _checkForAssignments();
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('⚠️ Location permissions are required for Emergency Responder Duty.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _checkForAssignments() async {
    if (_agentId == null || !_isOnDuty) return;
    try {
      final url = Uri.parse('${ApiService.baseUrl}/dashboard/agents/$_agentId/status');
      final res = await http.get(url).timeout(const Duration(seconds: 4));
      final data = jsonDecode(res.body);
      if (data['success'] == true && data['assignment'] != null) {
        if (mounted) {
          setState(() => _activeAlert = data['assignment']);
        }
      } else {
        if (mounted && _activeAlert != null) {
          setState(() => _activeAlert = null);
        }
      }
    } catch (_) {}
  }

  Future<void> _acceptMission() async {
    if (_activeAlert == null || _agentId == null) return;
    final alertId = _activeAlert!['id'];
    try {
      final url = Uri.parse('${ApiService.baseUrl}/dashboard/agents/$_agentId/accept-assignment');
      final res = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'alertId': alertId}),
      );
      if (res.statusCode == 200) {
        if (mounted) {
          setState(() {
            _activeAlert!['responderStatus'] = 'EN_ROUTE';
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('🚀 Mission Accepted! Control Room notified. You are now EN ROUTE.'),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    } catch (_) {}
  }

  Future<void> _stopDutyMode() async {
    _countdownTimer?.cancel();
    _assignmentPollTimer?.cancel();

    if (_agentId != null) {
      await LocationService.stopResponderDuty(agentId: _agentId!);
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('devi_shift_end_time');

    if (mounted) {
      setState(() {
        _isOnDuty = false;
        _shiftEndTime = null;
        _activeAlert = null;
      });
    }
  }

  Future<void> _logout() async {
    await _stopDutyMode();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('devi_responder_id');
    await prefs.remove('devi_responder_name');
    await prefs.remove('devi_responder_phone');
    await prefs.remove('devi_responder_area');

    if (mounted) {
      setState(() {
        _agentId = null;
        _agentName = null;
        _agentPhone = null;
        _agentArea = null;
      });
    }
  }

  String _formatDuration(Duration d) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final h = twoDigits(d.inHours);
    final m = twoDigits(d.inMinutes.remainder(60));
    final s = twoDigits(d.inSeconds.remainder(60));
    return '$h:$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B132B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C2541),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFF0284C7).withOpacity(0.3),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('🛡️', style: TextStyle(fontSize: 16)),
            ),
            const SizedBox(width: 10),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'DEVI Field Responder',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                Text(
                  '24/7 Foreground GPS Duty Mode',
                  style: TextStyle(fontSize: 11, color: Colors.white70),
                ),
              ],
            ),
          ],
        ),
        actions: [
          if (_agentId != null)
            IconButton(
              icon: const Icon(Icons.logout, color: Color(0xFFF87171), size: 20),
              tooltip: 'Logout',
              onPressed: _logout,
            ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: _agentId == null ? _buildLoginForm() : _buildActiveDutyView(),
        ),
      ),
    );
  }

  Widget _buildLoginForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 20),
        Container(
          width: 80,
          height: 80,
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFF0284C7).withOpacity(0.15),
            border: Border.all(color: const Color(0xFF0284C7), width: 2),
          ),
          child: const Center(
            child: Text('🛡️', style: TextStyle(fontSize: 40)),
          ),
        ),
        const Text(
          'Responder Sign In',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
        ),
        const SizedBox(height: 6),
        const Text(
          'Enter the registered phone number & 4-digit PIN you received on WhatsApp to start your duty shift.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.white70, height: 1.4),
        ),
        const SizedBox(height: 28),

        if (_errorMessage.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: Colors.red.withOpacity(0.15),
              border: Border.all(color: Colors.red.withOpacity(0.4)),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              _errorMessage,
              style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ),

        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'MOBILE NUMBER',
            labelStyle: const TextStyle(color: Colors.white60, fontSize: 12),
            prefixIcon: const Icon(Icons.phone_android, color: Color(0xFF38BDF8)),
            filled: true,
            fillColor: Colors.white.withOpacity(0.06),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withOpacity(0.15)),
            ),
          ),
        ),
        const SizedBox(height: 16),

        TextField(
          controller: _pinController,
          obscureText: true,
          maxLength: 6,
          keyboardType: TextInputType.number,
          style: const TextStyle(color: Colors.white, letterSpacing: 6, fontSize: 18),
          decoration: InputDecoration(
            counterText: '',
            labelText: '4-DIGIT SECURITY PIN',
            labelStyle: const TextStyle(color: Colors.white60, fontSize: 12, letterSpacing: 0),
            prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF38BDF8)),
            filled: true,
            fillColor: Colors.white.withOpacity(0.06),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withOpacity(0.15)),
            ),
          ),
        ),
        const SizedBox(height: 24),

        ElevatedButton(
          onPressed: _isLoading ? null : _loginResponder,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0284C7),
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: _isLoading
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text(
                  'START DUTY SHIFT',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                ),
        ),
      ],
    );
  }

  Widget _buildActiveDutyView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // EMERGENCY SOS POPUP (IF ASSIGNED)
        if (_activeAlert != null) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFDC2626), Color(0xFF991B1B)],
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.red.withOpacity(0.4),
                  blurRadius: 16,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Text('🚨', style: TextStyle(fontSize: 22)),
                    SizedBox(width: 8),
                    Text(
                      'EMERGENCY SOS ASSIGNED!',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  'Victim: ${_activeAlert!['user']?['name'] ?? _activeAlert!['userName'] ?? 'Emergency Victim'}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
                Text(
                  'Phone: ${_activeAlert!['user']?['phone'] ?? _activeAlert!['userPhone'] ?? 'N/A'}',
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                ),
                Text(
                  'Location: ${_activeAlert!['location'] ?? 'Live GPS Coordinates'}',
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: 14),
                if (_activeAlert!['responderStatus'] == 'EN_ROUTE') ...[
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withOpacity(0.25),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF10B981)),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('🚀', style: TextStyle(fontSize: 16)),
                        SizedBox(width: 8),
                        Text(
                          'YOU ARE EN ROUTE (CONTROL ROOM CONNECTED)',
                          style: TextStyle(color: Color(0xFF34D399), fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                ] else ...[
                  ElevatedButton.icon(
                    onPressed: _acceptMission,
                    icon: const Icon(Icons.check_circle_outline, color: Colors.black),
                    label: const Text('ACCEPT MISSION & START EN ROUTE', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.black)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF38BDF8),
                      padding: const EdgeInsets.symmetric(vertical: 13),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                ElevatedButton.icon(
                  onPressed: () {
                    final lat = _activeAlert!['latitude'];
                    final lng = _activeAlert!['longitude'];
                    if (lat != null && lng != null) {
                      launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng'));
                    }
                  },
                  icon: const Icon(Icons.navigation, color: Colors.white),
                  label: const Text('OPEN GOOGLE MAPS NAVIGATION', style: TextStyle(fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.black45,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
        ],

        // ON DUTY STATUS BADGE
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: const Color(0xFF1C2541),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: _isOnDuty ? const Color(0xFF10B981) : Colors.white24,
              width: 1.5,
            ),
          ),
          child: Column(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _isOnDuty ? const Color(0xFF10B981).withOpacity(0.2) : Colors.white10,
                  border: Border.all(
                    color: _isOnDuty ? const Color(0xFF10B981) : Colors.white30,
                    width: 2,
                  ),
                ),
                child: Center(
                  child: Text(_isOnDuty ? '🟢' : '⚪', style: const TextStyle(fontSize: 26)),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                _isOnDuty ? 'ON DUTY — LIVE TRACKING ACTIVE' : 'DUTY OFF-LINE',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                  color: _isOnDuty ? const Color(0xFF34D399) : Colors.white60,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                _agentName ?? 'Field Responder',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              if (_agentPhone != null)
                Text(
                  '📞 +91 $_agentPhone',
                  style: const TextStyle(fontSize: 12, color: Colors.white60),
                ),
              if (_agentArea != null && _agentArea!.isNotEmpty)
                Text(
                  'Assigned Sector: $_agentArea',
                  style: const TextStyle(fontSize: 13, color: Colors.white70),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // NOTIFICATION & LOCK-SCREEN GUARANTEE CARD
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.blue.withOpacity(0.08),
            border: Border.all(color: Colors.blue.withOpacity(0.25)),
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('🛡️', style: TextStyle(fontSize: 16)),
                  SizedBox(width: 8),
                  Text(
                    '24/7 Locked Screen Guarantee',
                    style: TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ],
              ),
              SizedBox(height: 6),
              Text(
                'The persistent status notification "🛡️ DEVI Responder: Live Duty Active" is pinned in your notification bar. Android OS will NEVER sleep or kill GPS — even if your phone is locked in your pocket for 10 hours.',
                style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.5),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // REMAINING SHIFT DURATION COUNTDOWN
        if (_isOnDuty)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withOpacity(0.1)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(Icons.timer_outlined, color: Color(0xFFFBBF24), size: 20),
                    SizedBox(width: 8),
                    Text('Shift Countdown:', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
                  ],
                ),
                Text(
                  _formatDuration(_remainingShift),
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFFBBF24),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 16),

        // TELEMETRY DISPLAY
        if (_latitude != null && _longitude != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withOpacity(0.1)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'GPS: ${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12, fontFamily: 'monospace'),
                ),
                Row(
                  children: [
                    if (_accuracy != null)
                      Text(
                        '±${_accuracy!.round()}m ',
                        style: const TextStyle(color: Color(0xFF34D399), fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    if (_speed != null && _speed! > 0)
                      Text(
                        '(${(_speed! * 3.6).round()} km/h)',
                        style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                  ],
                ),
              ],
            ),
          ),
        const SizedBox(height: 16),
        
        // GOOGLE MAP PORTAL (LOCATION CARD)
        if (_isOnDuty)
          const SizedBox(
            height: 300,
            child: LocationCard(),
          ),
        const SizedBox(height: 24),

        // DUTY TOGGLE BUTTON
        if (!_isOnDuty)
          ElevatedButton.icon(
            onPressed: () => _startDutyMode(),
            icon: const Icon(Icons.play_arrow, color: Colors.white),
            label: const Text('RESUME ON-DUTY SHIFT', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          )
        else
          ElevatedButton.icon(
            onPressed: _stopDutyMode,
            icon: const Icon(Icons.stop, color: Colors.white),
            label: const Text('🛑 STOP DUTY & GO OFF-LINE', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
      ],
    );
  }
}
