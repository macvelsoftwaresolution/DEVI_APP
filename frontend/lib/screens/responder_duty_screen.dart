import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';
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

class _ResponderDutyScreenState extends State<ResponderDutyScreen> with WidgetsBindingObserver {
  // Auth & Profile
  bool _isLoading = false;
  bool _isOnDuty = false;
  bool _isGpsDisabled = false;
  String? _agentId;
  String? _agentName;
  String? _agentPhone;
  String? _agentArea;

  // Login controllers
  final _phoneController = TextEditingController();
  final _pinController = TextEditingController();
  String _errorMessage = '';

  // Telemetry & Assignment Polling
  Timer? _assignmentPollTimer;

  // Live GPS telemetry
  double? _latitude;
  double? _longitude;
  double? _accuracy;
  double? _speed;

  // Active SOS Assignment
  Map<String, dynamic>? _activeAlert;

  List<LatLng>? _roadRoutePoints;
  String? _lastRouteAlertId;

  Future<void> _fetchRoadRoute() async {
    if (_latitude == null || _longitude == null || _activeAlert == null) return;
    if (_activeAlert!['responderStatus'] != 'EN_ROUTE') return;
    if (_lastRouteAlertId == _activeAlert!['id']) return;

    final victimLat = double.tryParse(_activeAlert!['latitude'].toString());
    final victimLng = double.tryParse(_activeAlert!['longitude'].toString());
    if (victimLat == null || victimLng == null) return;

    try {
      PolylinePoints polylinePoints = PolylinePoints(apiKey: "AIzaSyCVD-Yk9rET4YVlldHmgU9KuqzlQnQHfaM");
      PolylineResult result = await polylinePoints.getRouteBetweenCoordinates(
        request: PolylineRequest(
          origin: PointLatLng(_latitude!, _longitude!),
          destination: PointLatLng(victimLat, victimLng),
          mode: TravelMode.driving,
        ),
      );

      if (result.points.isNotEmpty) {
        if (mounted) {
          setState(() {
            _roadRoutePoints = result.points.map((p) => LatLng(p.latitude, p.longitude)).toList();
            _lastRouteAlertId = _activeAlert!['id'];
          });
        }
      }
    } catch (_) {}
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadSavedSession();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _assignmentPollTimer?.cancel();
    _phoneController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _agentId != null) {
      _checkLocationOnAppResume();
    }
  }

  Future<void> _checkLocationOnAppResume() async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (enabled) {
      if (_isGpsDisabled) {
        setState(() => _isGpsDisabled = false);
      }
      if (!_isOnDuty) {
        _startDutyMode();
      }
    } else {
      if (!_isGpsDisabled) {
        setState(() {
          _isGpsDisabled = true;
          _isOnDuty = false;
        });
      }
    }
  }

  Future<void> _loadSavedSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedId = prefs.getString('devi_responder_id');
    final savedName = prefs.getString('devi_responder_name');
    final savedPhone = prefs.getString('devi_responder_phone');
    final savedArea = prefs.getString('devi_responder_area');

    if (savedId != null && savedName != null) {
      setState(() {
        _agentId = savedId;
        _agentName = savedName;
        _agentPhone = savedPhone;
        _agentArea = savedArea;
      });

      // Automatically start duty mode when resuming session
      _startDutyMode();
    }
  }

  Future<void> _loginResponder() async {
    String phone = _phoneController.text.trim().replaceAll(RegExp(r'\D'), '');
    final pin = _pinController.text.trim();

    if (phone.length == 12 && phone.startsWith('91')) {
      phone = phone.substring(2);
    } else if (phone.length == 11 && phone.startsWith('0')) {
      phone = phone.substring(1);
    }

    if (phone.length != 10) {
      setState(() => _errorMessage = 'Enter exactly 10-digit mobile number');
      return;
    }
    if (pin.length < 4) {
      setState(() => _errorMessage = 'Enter your 4-digit PIN');
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

        // Automatically go On Duty upon login
        _startDutyMode();
      } else {
        setState(() => _errorMessage = data['message'] ?? 'Invalid phone or PIN');
      }
    } catch (e) {
      setState(() => _errorMessage = 'Network error. Please try again.');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _startDutyMode() async {
    if (_agentId == null) return;

    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      if (mounted) {
        setState(() {
          _isGpsDisabled = true;
          _isOnDuty = false;
        });
        _showEnableGpsDialog();
      }
      return;
    }

    final success = await LocationService.startResponderDuty(
      agentId: _agentId!,
      agentName: _agentName ?? 'DEVI Responder',
      intervalSeconds: 2,
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
      onRemoteDutyEnded: () {
        if (mounted) {
          _stopDutyMode(fromRemote: true);
        }
      },
    );

    if (success) {
      setState(() {
        _isOnDuty = true;
        _isGpsDisabled = false;
      });

      try {
        final dUrl = Uri.parse('${ApiService.baseUrl}/dashboard/agents/$_agentId/duty');
        await http.post(
          dUrl,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'status': 'ON_DUTY'}),
        ).timeout(const Duration(seconds: 4));
      } catch (_) {}

      _assignmentPollTimer?.cancel();
      _assignmentPollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _checkForAssignments());
      _checkForAssignments();
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Location permission required for duty mode'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  Future<void> _showEnableGpsDialog() async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Device Location is OFF', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
        content: const Text(
          'Your phone GPS is turned off. Please turn on Location in settings to start active duty tracking.',
          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Later', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await Geolocator.openLocationSettings();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0284C7),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('Turn On Location', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Future<void> _checkForAssignments() async {
    if (_agentId == null || !_isOnDuty) return;
    try {
      final url = Uri.parse('${ApiService.baseUrl}/dashboard/agents/$_agentId/status');
      final res = await http.get(url).timeout(const Duration(seconds: 4));
      final data = jsonDecode(res.body);
      if (data['success'] == true) {
        if (data['agent'] != null) {
          final agentStatus = data['agent']['duty_status'] ?? data['agent']['status'];
          if (agentStatus == 'OFF_DUTY' && _isOnDuty) {
            _stopDutyMode(fromRemote: true);
            return;
          }
        }
        if (data['assignment'] != null) {
          if (mounted) {
            setState(() => _activeAlert = data['assignment']);
          }
        } else {
          if (mounted && _activeAlert != null) {
            setState(() => _activeAlert = null);
          }
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
              content: Text('Mission accepted. Status: En Route'),
              backgroundColor: Color(0xFF10B981),
            ),
          );
        }
      }
    } catch (_) {}
  }

  Future<void> _stopDutyMode({bool fromRemote = false}) async {
    _assignmentPollTimer?.cancel();

    if (_agentId != null) {
      await LocationService.stopResponderDuty(agentId: _agentId!, notifyBackend: !fromRemote);
      if (!fromRemote) {
        try {
          final url = Uri.parse('${ApiService.baseUrl}/dashboard/agents/$_agentId/duty');
          await http.post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'status': 'OFF_DUTY'}),
          ).timeout(const Duration(seconds: 4));
        } catch (_) {}
      }
    }

    if (mounted) {
      setState(() {
        _isOnDuty = false;
        _activeAlert = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(fromRemote ? 'Duty ended by Control Room' : 'Duty paused. You are now Off Duty'),
          backgroundColor: const Color(0xFFF97316),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _logout() async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Go Off Duty & Sign Out?', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        content: const Text(
          'Signing out will end your duty session and turn off live GPS tracking.',
          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('Sign Out', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (shouldLogout != true) return;

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                color: const Color(0xFF0284C7).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.shield_outlined, color: Color(0xFF38BDF8), size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Agent Portal',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                  Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _isOnDuty ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _isOnDuty ? 'Active Duty' : 'Off Duty',
                        style: TextStyle(
                          fontSize: 12,
                          color: _isOnDuty ? const Color(0xFF34D399) : const Color(0xFF94A3B8),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (_agentId != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
              child: InkWell(
                onTap: _logout,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.power_settings_new_rounded, color: Color(0xFFEF4444), size: 15),
                      SizedBox(width: 4),
                      Text(
                        'Off Duty',
                        style: TextStyle(
                          color: Color(0xFFEF4444),
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: _agentId == null ? _buildLoginForm() : _buildActiveDutyView(),
        ),
      ),
    );
  }

  Widget _buildLoginForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF0284C7).withValues(alpha: 0.12),
              border: Border.all(color: const Color(0xFF0284C7).withValues(alpha: 0.3), width: 1.5),
            ),
            child: const Icon(Icons.security, size: 36, color: Color(0xFF38BDF8)),
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Agent Sign In',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
        ),
        const SizedBox(height: 6),
        const Text(
          'Sign in to automatically begin duty tracking',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
        ),
        const SizedBox(height: 28),

        if (_errorMessage.isNotEmpty)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: const Color(0xFFEF4444).withValues(alpha: 0.12),
              border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                const Icon(Icons.error_outline, color: Color(0xFFFCA5A5), size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _errorMessage,
                    style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
                  ),
                ),
              ],
            ),
          ),

        // Phone Input
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          decoration: InputDecoration(
            hintText: 'Mobile number',
            hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 14),
            prefixIcon: const Icon(Icons.phone_outlined, color: Color(0xFF38BDF8), size: 20),
            filled: true,
            fillColor: const Color(0xFF1E293B),
            contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF334155)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF0284C7), width: 1.5),
            ),
          ),
        ),
        const SizedBox(height: 14),

        // PIN Input
        TextField(
          controller: _pinController,
          obscureText: true,
          maxLength: 6,
          keyboardType: TextInputType.number,
          style: const TextStyle(color: Colors.white, letterSpacing: 4, fontSize: 16),
          decoration: InputDecoration(
            counterText: '',
            hintText: 'Security PIN',
            hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 14, letterSpacing: 0),
            prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF38BDF8), size: 20),
            filled: true,
            fillColor: const Color(0xFF1E293B),
            contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF334155)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF0284C7), width: 1.5),
            ),
          ),
        ),
        const SizedBox(height: 24),

        // Submit Button
        SizedBox(
          height: 48,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _loginResponder,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0284C7),
              foregroundColor: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Sign In & Go On Duty', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                      SizedBox(width: 8),
                      Icon(Icons.arrow_forward_rounded, size: 18),
                    ],
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildActiveDutyView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // EMERGENCY MISSION DISPATCH CARD
        if (_activeAlert != null) ...[
          _buildEmergencyCard(),
          const SizedBox(height: 16),
        ],

        // GPS DISABLED WARNING BANNER
        if (_isGpsDisabled) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(
              color: const Color(0xFFEF4444).withValues(alpha: 0.15),
              border: Border.all(color: const Color(0xFFEF4444)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.location_off_rounded, color: Color(0xFFF87171), size: 20),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Device Location is OFF. Tap to enable.',
                    style: TextStyle(color: Color(0xFFFCA5A5), fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
                ElevatedButton(
                  onPressed: () => Geolocator.openLocationSettings(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEF4444),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    minimumSize: Size.zero,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  ),
                  child: const Text('Turn On', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)),
                ),
              ],
            ),
          ),
        ],

        // AGENT PROFILE & DUTY STATUS CARD
        _buildProfileCard(),
        const SizedBox(height: 14),

        // TELEMETRY METRICS
        if (_isOnDuty) ...[
          _buildMetricsGrid(),
          const SizedBox(height: 14),
        ],

        // BACKGROUND GPS CHIP
        _buildGpsStatusBadge(),
        const SizedBox(height: 16),

        // GOOGLE MAP PORTAL (LOCATION CARD)
        if (_isOnDuty)
          SizedBox(
            height: 300,
            child: LocationCard(
              latitude: _latitude,
              longitude: _longitude,
              accuracy: _accuracy,
              victimLatitude: _activeAlert?['latitude'] != null ? double.tryParse(_activeAlert!['latitude'].toString()) : null,
              victimLongitude: _activeAlert?['longitude'] != null ? double.tryParse(_activeAlert!['longitude'].toString()) : null,
              routePoints: (_activeAlert?['latitude'] != null && _latitude != null) 
                  ? [
                      LatLng(_latitude!, _longitude!),
                      LatLng(
                        double.tryParse(_activeAlert!['latitude'].toString()) ?? 0, 
                        double.tryParse(_activeAlert!['longitude'].toString()) ?? 0
                      )
                    ] 
                  : null,
              isTracking: true,
            ),
          ),
      ],
    );
  }

  Widget _buildProfileCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _isOnDuty ? const Color(0xFF10B981).withValues(alpha: 0.4) : const Color(0xFF334155),
          width: 1.2,
        ),
      ),
      child: Row(
        children: [
          // Avatar circle
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _isOnDuty ? const Color(0xFF10B981).withValues(alpha: 0.15) : const Color(0xFF334155),
              border: Border.all(
                color: _isOnDuty ? const Color(0xFF10B981) : const Color(0xFF475569),
                width: 1.5,
              ),
            ),
            child: Center(
              child: Icon(
                Icons.person_rounded,
                color: _isOnDuty ? const Color(0xFF34D399) : const Color(0xFF94A3B8),
                size: 24,
              ),
            ),
          ),
          const SizedBox(width: 14),

          // Name and info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _agentName ?? 'Field Agent',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 5),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_agentArea != null && _agentArea!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.location_on, size: 12, color: Color(0xFF38BDF8)),
                              const SizedBox(width: 3),
                              Flexible(
                                child: Text(
                                  _agentArea!,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: Color(0xFFE2E8F0),
                                    fontWeight: FontWeight.w600,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    if (_agentPhone != null)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.phone_outlined, size: 11, color: Color(0xFF94A3B8)),
                          const SizedBox(width: 3),
                          Text(
                            '+91 $_agentPhone',
                            style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                          ),
                        ],
                      ),
                  ],
                ),
              ],
            ),
          ),

          // Status Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: _isOnDuty
                  ? const Color(0xFF10B981).withValues(alpha: 0.15)
                  : const Color(0xFF64748B).withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: _isOnDuty ? const Color(0xFF10B981) : const Color(0xFF64748B),
                width: 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _isOnDuty ? const Color(0xFF34D399) : const Color(0xFF94A3B8),
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  _isOnDuty ? 'ON DUTY' : 'OFFLINE',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                    color: _isOnDuty ? const Color(0xFF34D399) : const Color(0xFF94A3B8),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmergencyCard() {
    final victimName = _activeAlert!['user']?['name'] ?? _activeAlert!['userName'] ?? 'Emergency Victim';
    final victimPhone = _activeAlert!['user']?['phone'] ?? _activeAlert!['userPhone'] ?? '';
    final locationText = _activeAlert!['location'] ?? 'Live coordinates';
    final isEnRoute = _activeAlert!['responderStatus'] == 'EN_ROUTE';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF991B1B), Color(0xFF7F1D1D)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEF4444), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFEF4444).withValues(alpha: 0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Banner row
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 18),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Emergency Mission Assigned',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
              if (isEnRoute)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'En Route',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),

          // Victim detail card
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    const Icon(Icons.person_pin, size: 16, color: Colors.white70),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        victimName,
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                      ),
                    ),
                    if (victimPhone.isNotEmpty)
                      InkWell(
                        onTap: () => launchUrl(Uri.parse('tel:$victimPhone')),
                        borderRadius: BorderRadius.circular(6),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Row(
                            children: [
                              Icon(Icons.call, size: 14, color: Colors.white),
                              SizedBox(width: 4),
                              Text('Call', style: TextStyle(fontSize: 12, color: Colors.white)),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.place_outlined, size: 16, color: Colors.white60),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        locationText,
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Action buttons
          Row(
            children: [
              if (!isEnRoute) ...[
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _acceptMission,
                    icon: const Icon(Icons.check_circle_outline, size: 18),
                    label: const Text('Accept', style: TextStyle(fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF10B981),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 11),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      elevation: 0,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {
                    final lat = _activeAlert!['latitude'];
                    final lng = _activeAlert!['longitude'];
                    if (lat != null && lng != null) {
                      launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng'));
                    }
                  },
                  icon: const Icon(Icons.navigation_outlined, size: 18),
                  label: const Text('Navigate', style: TextStyle(fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetricsGrid() {
    return Row(
      children: [
        // Duty Status Card
        Expanded(
          child: _metricCard(
            icon: Icons.shield_rounded,
            iconColor: const Color(0xFF10B981),
            label: 'Duty Mode',
            value: _isOnDuty ? 'Active' : 'Offline',
          ),
        ),
        const SizedBox(width: 10),

        // GPS Accuracy Card
        Expanded(
          child: _metricCard(
            icon: Icons.my_location_rounded,
            iconColor: const Color(0xFF38BDF8),
            label: 'GPS Accuracy',
            value: _accuracy != null ? '±${_accuracy!.round()}m' : 'Locating...',
          ),
        ),
        const SizedBox(width: 10),

        // Speed Card
        Expanded(
          child: _metricCard(
            icon: Icons.speed_rounded,
            iconColor: const Color(0xFF34D399),
            label: 'Speed',
            value: _speed != null && _speed! > 0 ? '${(_speed! * 3.6).round()} km/h' : '0 km/h',
          ),
        ),
      ],
    );
  }

  Widget _metricCard({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String value,
    bool isMonospace = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        children: [
          Icon(icon, color: iconColor, size: 18),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              fontFamily: isMonospace ? 'monospace' : null,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
          ),
        ],
      ),
    );
  }

  Widget _buildGpsStatusBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: _isOnDuty
            ? const Color(0xFF0284C7).withValues(alpha: 0.08)
            : const Color(0xFF334155).withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: _isOnDuty ? const Color(0xFF0284C7).withValues(alpha: 0.25) : const Color(0xFF334155),
        ),
      ),
      child: Row(
        children: [
          Icon(
            _isOnDuty ? Icons.radar_rounded : Icons.location_off_outlined,
            size: 16,
            color: _isOnDuty ? const Color(0xFF38BDF8) : const Color(0xFF94A3B8),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _isOnDuty ? 'Background GPS Active' : 'GPS Standby (Offline)',
                  style: TextStyle(
                    fontSize: 12,
                    color: _isOnDuty ? const Color(0xFF38BDF8) : const Color(0xFF94A3B8),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (_isOnDuty && _latitude != null && _longitude != null)
                  Text(
                    '${_latitude!.toStringAsFixed(4)}, ${_longitude!.toStringAsFixed(4)}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF64748B),
                      fontFamily: 'monospace',
                    ),
                  ),
              ],
            ),
          ),
          if (_isOnDuty)
            Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Color(0xFF34D399),
              ),
            ),
        ],
      ),
    );
  }
}
