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
  DateTime? _lastRouteFetchTime;

  GoogleMapController? _mapController;
  MapType _currentMapType = MapType.normal;

  Future<void> _fetchRoadRoute() async {
    if (_latitude == null || _longitude == null || _activeAlert == null) return;

    final victimLat = double.tryParse(_activeAlert!['latitude'].toString());
    final victimLng = double.tryParse(_activeAlert!['longitude'].toString());
    if (victimLat == null || victimLng == null) return;

    final now = DateTime.now();
    if (_lastRouteAlertId == _activeAlert!['id'] && _lastRouteFetchTime != null) {
      if (now.difference(_lastRouteFetchTime!).inSeconds < 6) return;
    }

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
            _lastRouteFetchTime = now;
          });
          _fitMapBounds();
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
          if (_activeAlert != null) {
            _fetchRoadRoute();
          }
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
            _fetchRoadRoute();
            _fitMapBounds();
          }
        } else {
          if (mounted && _activeAlert != null) {
            setState(() {
              _activeAlert = null;
              _roadRoutePoints = null;
            });
            _recenterToAgent();
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
    if (_agentId != null) {
      // Swiggy / Zomato style full-screen hero map view for on-duty responder
      return Scaffold(
        backgroundColor: const Color(0xFF0F172A),
        body: SafeArea(
          child: _buildSwiggyZomatoDutyView(),
        ),
      );
    }

    // Agent Login Screen
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Agent Portal Sign In',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: _buildLoginForm(),
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

  Widget _buildSwiggyZomatoDutyView() {
    return Stack(
      children: [
        // 1. HERO FULL-SCREEN GOOGLE MAP
        Positioned.fill(
          child: GoogleMap(
            initialCameraPosition: CameraPosition(
              target: LatLng(_latitude ?? 10.85, _longitude ?? 78.70),
              zoom: 15.0,
            ),
            mapType: _currentMapType,
            onMapCreated: (GoogleMapController controller) {
              _mapController = controller;
              _fitMapBounds();
            },
            markers: _buildMapMarkers(),
            polylines: _buildMapPolylines(),
            circles: _buildMapCircles(),
            myLocationEnabled: false,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            padding: EdgeInsets.only(
              bottom: _activeAlert != null ? 310 : 230,
              top: 75,
            ),
          ),
        ),

        // 2. FLOATING MAP CONTROLS (RIGHT EDGE, ABOVE BOTTOM SHEET)
        Positioned(
          right: 14,
          bottom: _activeAlert != null ? 320 : 240,
          child: _buildFloatingMapControls(),
        ),

        // 3. FLOATING TOP BAR (AGENT & STATUS OVERLAY)
        Positioned(
          top: 12,
          left: 14,
          right: 14,
          child: _buildFloatingTopBar(),
        ),

        // 4. GPS DISABLED WARNING BANNER (IF OFF)
        if (_isGpsDisabled)
          Positioned(
            top: 78,
            left: 14,
            right: 14,
            child: InkWell(
              onTap: () => Geolocator.openLocationSettings(),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444),
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 8),
                  ],
                ),
                child: const Row(
                  children: [
                    Icon(Icons.location_off_rounded, color: Colors.white, size: 16),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Device Location is OFF. Tap to enable GPS.',
                        style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: Colors.white, size: 18),
                  ],
                ),
              ),
            ),
          ),

        // 5. SWIGGY / ZOMATO STYLE BOTTOM SHEET CARD
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: _buildSwiggyZomatoBottomSheet(),
        ),
      ],
    );
  }

  Set<Marker> _buildMapMarkers() {
    final markers = <Marker>{};
    if (_latitude != null && _longitude != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('current_agent_loc'),
          position: LatLng(_latitude!, _longitude!),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          infoWindow: InfoWindow(
            title: _agentName ?? 'My Location (Responder)',
            snippet: _isOnDuty ? '🟢 On Duty' : 'Off Duty',
          ),
        ),
      );
    }
    if (_activeAlert != null) {
      final victimLat = double.tryParse(_activeAlert!['latitude']?.toString() ?? '');
      final victimLng = double.tryParse(_activeAlert!['longitude']?.toString() ?? '');
      if (victimLat != null && victimLng != null) {
        final victimName = _activeAlert!['user']?['name'] ?? _activeAlert!['userName'] ?? 'Emergency Victim';
        final locationText = _activeAlert!['location'] ?? 'Emergency Scene';
        markers.add(
          Marker(
            markerId: const MarkerId('victim_emergency_loc'),
            position: LatLng(victimLat, victimLng),
            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
            infoWindow: InfoWindow(
              title: '🚨 $victimName',
              snippet: locationText,
            ),
          ),
        );
      }
    }
    return markers;
  }

  Set<Polyline> _buildMapPolylines() {
    final polylines = <Polyline>{};
    if (_roadRoutePoints != null && _roadRoutePoints!.isNotEmpty) {
      polylines.add(
        Polyline(
          polylineId: const PolylineId('roadway_route'),
          points: _roadRoutePoints!,
          color: const Color(0xFF10B981), // Solid Emerald Green
          width: 6,
        ),
      );
    } else if (_activeAlert != null && _latitude != null && _longitude != null) {
      final victimLat = double.tryParse(_activeAlert!['latitude']?.toString() ?? '');
      final victimLng = double.tryParse(_activeAlert!['longitude']?.toString() ?? '');
      if (victimLat != null && victimLng != null) {
        polylines.add(
          Polyline(
            polylineId: const PolylineId('direct_line'),
            points: [LatLng(_latitude!, _longitude!), LatLng(victimLat, victimLng)],
            color: const Color(0xFF10B981).withValues(alpha: 0.8),
            width: 4,
            patterns: [PatternItem.dash(15), PatternItem.gap(10)],
          ),
        );
      }
    }

    // Real-time breadcrumb trail from victim movement
    final crumbs = (_activeAlert?['breadcrumbs'] as List?)
        ?.map((b) {
          final lat = double.tryParse(b['latitude']?.toString() ?? '');
          final lng = double.tryParse(b['longitude']?.toString() ?? '');
          if (lat != null && lng != null) return LatLng(lat, lng);
          return null;
        })
        .whereType<LatLng>()
        .toList();
    if (crumbs != null && crumbs.length > 1) {
      polylines.add(
        Polyline(
          polylineId: const PolylineId('victim_breadcrumbs_trail'),
          points: crumbs,
          color: const Color(0xFFEF4444),
          width: 4,
          patterns: [PatternItem.dash(10), PatternItem.gap(6)],
        ),
      );
    }

    return polylines;
  }

  Set<Circle> _buildMapCircles() {
    final circles = <Circle>{};
    if (_latitude != null && _longitude != null) {
      circles.add(
        Circle(
          circleId: const CircleId('agent_accuracy_circle'),
          center: LatLng(_latitude!, _longitude!),
          radius: (_accuracy ?? 15.0).clamp(5.0, 80.0),
          fillColor: const Color(0xFF0284C7).withValues(alpha: 0.15),
          strokeColor: const Color(0xFF38BDF8).withValues(alpha: 0.5),
          strokeWidth: 1,
        ),
      );
    }
    return circles;
  }

  void _fitMapBounds() {
    if (_mapController == null) return;
    final victimLat = double.tryParse(_activeAlert?['latitude']?.toString() ?? '');
    final victimLng = double.tryParse(_activeAlert?['longitude']?.toString() ?? '');

    if (_latitude != null && _longitude != null && victimLat != null && victimLng != null) {
      final latDiff = (_latitude! - victimLat).abs();
      final lngDiff = (_longitude! - victimLng).abs();
      if (latDiff < 0.0003 && lngDiff < 0.0003) {
        _mapController!.animateCamera(
          CameraUpdate.newLatLngZoom(
            LatLng((_latitude! + victimLat) / 2, (_longitude! + victimLng) / 2),
            17.5,
          ),
        );
        return;
      }
      final bounds = LatLngBounds(
        southwest: LatLng(
          _latitude! < victimLat ? _latitude! : victimLat,
          _longitude! < victimLng ? _longitude! : victimLng,
        ),
        northeast: LatLng(
          _latitude! > victimLat ? _latitude! : victimLat,
          _longitude! > victimLng ? _longitude! : victimLng,
        ),
      );
      _mapController!.animateCamera(CameraUpdate.newLatLngBounds(bounds, 70));
    } else if (_latitude != null && _longitude != null) {
      _mapController!.animateCamera(CameraUpdate.newLatLngZoom(LatLng(_latitude!, _longitude!), 16.5));
    }
  }

  void _recenterToAgent() {
    if (_mapController == null || _latitude == null || _longitude == null) return;
    _mapController!.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(_latitude!, _longitude!), 16.5),
    );
  }

  Widget _buildFloatingMapControls() {
    final hasMission = _activeAlert != null;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Map Type Toggle (Satellite / Normal)
        FloatingActionButton.small(
          heroTag: 'fab_map_type',
          backgroundColor: const Color(0xFF1E293B),
          foregroundColor: _currentMapType == MapType.satellite ? const Color(0xFF38BDF8) : Colors.white70,
          elevation: 4,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: Color(0xFF334155), width: 1),
          ),
          onPressed: () {
            setState(() {
              _currentMapType = _currentMapType == MapType.normal ? MapType.satellite : MapType.normal;
            });
          },
          tooltip: 'Toggle Satellite',
          child: const Icon(Icons.layers_rounded, size: 20),
        ),
        const SizedBox(height: 10),

        // Fit Route Button (if active mission exists)
        if (hasMission) ...[
          FloatingActionButton.small(
            heroTag: 'fab_fit_route',
            backgroundColor: const Color(0xFF10B981),
            foregroundColor: Colors.white,
            elevation: 4,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            onPressed: _fitMapBounds,
            tooltip: 'Fit Route to Screen',
            child: const Icon(Icons.alt_route_rounded, size: 20),
          ),
          const SizedBox(height: 10),
        ],

        // Recenter to My Location Button
        FloatingActionButton.small(
          heroTag: 'fab_recenter',
          backgroundColor: const Color(0xFF1E293B),
          foregroundColor: const Color(0xFF38BDF8),
          elevation: 4,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: Color(0xFF334155), width: 1),
          ),
          onPressed: _recenterToAgent,
          tooltip: 'My Location',
          child: const Icon(Icons.my_location_rounded, size: 20),
        ),
      ],
    );
  }

  Widget _buildFloatingTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A).withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF334155).withValues(alpha: 0.8)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.4),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          // Back button
          InkWell(
            onTap: () => Navigator.pop(context),
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.arrow_back_ios_new_rounded, size: 16, color: Colors.white),
            ),
          ),
          const SizedBox(width: 10),

          // Agent name & duty indicator
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        _agentName ?? 'DEVI Responder',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: _isOnDuty
                            ? const Color(0xFF10B981).withValues(alpha: 0.2)
                            : const Color(0xFF64748B).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: _isOnDuty ? const Color(0xFF10B981) : const Color(0xFF64748B),
                          width: 0.8,
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
                          const SizedBox(width: 4),
                          Text(
                            _isOnDuty ? 'LIVE' : 'OFFLINE',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: _isOnDuty ? const Color(0xFF34D399) : const Color(0xFF94A3B8),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    if (_accuracy != null)
                      Text(
                        'GPS ±${_accuracy!.round()}m',
                        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                      ),
                    if (_speed != null && _speed! > 0) ...[
                      const Text(' • ', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                      Text(
                        '${(_speed! * 3.6).round()} km/h',
                        style: const TextStyle(color: Color(0xFF34D399), fontSize: 11, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),

          // Logout / Off-duty action
          InkWell(
            onTap: _logout,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.power_settings_new_rounded, color: Color(0xFFF87171), size: 14),
                  SizedBox(width: 4),
                  Text(
                    'Sign Out',
                    style: TextStyle(color: Color(0xFFF87171), fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSwiggyZomatoBottomSheet() {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(
          color: _activeAlert != null ? const Color(0xFFEF4444) : const Color(0xFF334155),
          width: _activeAlert != null ? 1.5 : 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.6),
            blurRadius: 20,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF475569),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              if (_activeAlert != null)
                _buildActiveMissionContent()
              else
                _buildIdleDutyContent(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActiveMissionContent() {
    final victimName = _activeAlert!['user']?['name'] ?? _activeAlert!['userName'] ?? 'Emergency Victim';
    final victimPhone = _activeAlert!['user']?['phone'] ?? _activeAlert!['userPhone'] ?? '';
    final locationText = _activeAlert!['location'] ?? 'Live GPS Coordinates';
    final isEnRoute = _activeAlert!['responderStatus'] == 'EN_ROUTE';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Priority Badge Row
        Row(
          children: [
            Expanded(
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 16),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'EMERGENCY SOS ASSIGNED',
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFFF87171),
                        letterSpacing: 0.5,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: isEnRoute ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                isEnRoute ? 'EN ROUTE' : 'PRIORITY P1',
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Victim Information Card
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: Icon(Icons.person_rounded, color: Color(0xFFF87171), size: 20),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      victimName,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      locationText,
                      style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (victimPhone.isNotEmpty) ...[
                const SizedBox(width: 8),
                InkWell(
                  onTap: () => launchUrl(Uri.parse('tel:$victimPhone')),
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0284C7).withValues(alpha: 0.2),
                      border: Border.all(color: const Color(0xFF0284C7)),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.phone, size: 14, color: Color(0xFF38BDF8)),
                        SizedBox(width: 4),
                        Text('Call', style: TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 12)),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Action Buttons
        if (!isEnRoute)
          ElevatedButton(
            onPressed: _acceptMission,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              elevation: 4,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.check_circle_rounded, size: 20),
                SizedBox(width: 8),
                Flexible(
                  child: Text(
                    'ACCEPT MISSION (I AM EN ROUTE)',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          )
        else
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {
                    final lat = _activeAlert!['latitude'];
                    final lng = _activeAlert!['longitude'];
                    if (lat != null && lng != null) {
                      launchUrl(
                        Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving'),
                        mode: LaunchMode.externalApplication,
                      );
                    }
                  },
                  icon: const Icon(Icons.navigation_rounded, size: 18),
                  label: const FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text('NAVIGATE IN MAPS', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0284C7),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              InkWell(
                onTap: _fitMapBounds,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF10B981)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.center_focus_strong_rounded, size: 16, color: Color(0xFF34D399)),
                      SizedBox(width: 6),
                      Text('Fit View', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF34D399))),
                    ],
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }

  Widget _buildIdleDutyContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Duty Status Header
        Row(
          children: [
            Expanded(
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF10B981).withValues(alpha: 0.15),
                      border: Border.all(color: const Color(0xFF10B981), width: 1.5),
                    ),
                    child: const Center(
                      child: Icon(Icons.shield_rounded, color: Color(0xFF34D399), size: 18),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _agentName ?? 'Field Responder',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Sector: ${_agentArea ?? 'Active Zone'}${_agentPhone != null ? ' • +91 $_agentPhone' : ''}',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF10B981)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.radar_rounded, size: 12, color: Color(0xFF34D399)),
                  SizedBox(width: 5),
                  Text('PATROLLING', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF34D399))),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Telemetry Metrics Row
        Row(
          children: [
            Expanded(
              child: _swiggyMetricPill(
                icon: Icons.speed_rounded,
                iconColor: const Color(0xFF34D399),
                title: 'Speed',
                value: _speed != null && _speed! > 0 ? '${(_speed! * 3.6).round()} km/h' : '0 km/h',
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _swiggyMetricPill(
                icon: Icons.my_location_rounded,
                iconColor: const Color(0xFF38BDF8),
                title: 'Accuracy',
                value: _accuracy != null ? '±${_accuracy!.round()}m' : 'Acquiring',
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _swiggyMetricPill(
                icon: Icons.sync_rounded,
                iconColor: const Color(0xFFA78BFA),
                title: 'Streaming',
                value: '2s Live',
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Reassuring Notice
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: const Row(
            children: [
              Icon(Icons.notifications_active_outlined, color: Color(0xFF38BDF8), size: 16),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Emergency dispatch listening in background. You will receive an instant sound & route alert when an SOS occurs.',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, height: 1.3),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _swiggyMetricPill({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String value,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 12, color: iconColor),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  title,
                  style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
              maxLines: 1,
            ),
          ),
        ],
      ),
    );
  }
}
