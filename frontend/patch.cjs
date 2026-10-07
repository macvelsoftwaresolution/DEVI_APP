const fs = require('fs');
let code = fs.readFileSync('lib/screens/responder_duty_screen.dart', 'utf8');

// 1. Add import
const importTarget = "import 'package:google_maps_flutter/google_maps_flutter.dart';";
const importReplacement = "import 'package:google_maps_flutter/google_maps_flutter.dart';\nimport 'package:flutter_polyline_points/flutter_polyline_points.dart';";
if (code.includes(importTarget) && !code.includes('flutter_polyline_points.dart')) {
  code = code.replace(importTarget, importReplacement);
}

// 2. Add state variables and fetch function
const stateTarget = "  Map<String, dynamic>? _activeAlert;";
const stateReplacement = `  Map<String, dynamic>? _activeAlert;

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
      PolylinePoints polylinePoints = PolylinePoints();
      PolylineResult result = await polylinePoints.getRouteBetweenCoordinates(
        googleApiKey: "AIzaSyCVD-Yk9rET4YVlldHmgU9KuqzlQnQHfaM",
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
  }`;
if (code.includes(stateTarget) && !code.includes('_fetchRoadRoute')) {
  code = code.replace(stateTarget, stateReplacement);
}

// 3. Update _acceptMission
const acceptTarget = `          setState(() {
            _activeAlert!['responderStatus'] = 'EN_ROUTE';
          });
          ScaffoldMessenger.of(context).showSnackBar(`;
const acceptReplacement = `          setState(() {
            _activeAlert!['responderStatus'] = 'EN_ROUTE';
          });
          _fetchRoadRoute();
          ScaffoldMessenger.of(context).showSnackBar(`;
if (code.includes(acceptTarget)) {
  code = code.replace(acceptTarget, acceptReplacement);
}

// 4. Update LocationCard in build
const cardTarget = `                routePoints: (_activeAlert?['latitude'] != null && _latitude != null) 
                    ? [
                        LatLng(_latitude!, _longitude!),
                        LatLng(
                          double.tryParse(_activeAlert!['latitude'].toString()) ?? 0, 
                          double.tryParse(_activeAlert!['longitude'].toString()) ?? 0
                        ),
                      ] 
                    : null,`;
const cardReplacement = `                routePoints: _roadRoutePoints ?? ((_activeAlert?['latitude'] != null && _latitude != null) 
                    ? [
                        LatLng(_latitude!, _longitude!),
                        LatLng(
                          double.tryParse(_activeAlert!['latitude'].toString()) ?? 0, 
                          double.tryParse(_activeAlert!['longitude'].toString()) ?? 0
                        ),
                      ] 
                    : null),`;
if (code.includes(cardTarget)) {
  code = code.replace(cardTarget, cardReplacement);
}

// 5. Update _checkForAssignments
const checkTarget = `        if (data['assignment'] != null) {
          if (mounted) {
            setState(() => _activeAlert = data['assignment']);
          }
        }`;
const checkReplacement = `        if (data['assignment'] != null) {
          if (mounted) {
            setState(() => _activeAlert = data['assignment']);
            if (_activeAlert!['responderStatus'] == 'EN_ROUTE') {
              _fetchRoadRoute();
            }
          }
        }`;
if (code.includes(checkTarget)) {
  code = code.replace(checkTarget, checkReplacement);
}

fs.writeFileSync('lib/screens/responder_duty_screen.dart', code);
console.log('SUCCESS');
