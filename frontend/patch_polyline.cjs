const fs = require('fs');
let code = fs.readFileSync('lib/screens/responder_duty_screen.dart', 'utf8');

const target = `    try {
      PolylinePoints polylinePoints = PolylinePoints();
      PolylineResult result = await polylinePoints.getRouteBetweenCoordinates(
        googleApiKey: "AIzaSyCVD-Yk9rET4YVlldHmgU9KuqzlQnQHfaM",
        request: PolylineRequest(
          origin: PointLatLng(_latitude!, _longitude!),
          destination: PointLatLng(victimLat, victimLng),
          mode: TravelMode.driving,
        ),
      );`;

const replacement = `    try {
      PolylinePoints polylinePoints = PolylinePoints(apiKey: "AIzaSyCVD-Yk9rET4YVlldHmgU9KuqzlQnQHfaM");
      PolylineResult result = await polylinePoints.getRouteBetweenCoordinates(
        request: PolylineRequest(
          origin: PointLatLng(_latitude!, _longitude!),
          destination: PointLatLng(victimLat, victimLng),
          mode: TravelMode.driving,
        ),
      );`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('lib/screens/responder_duty_screen.dart', code);
  console.log('SUCCESS');
} else {
  console.log('FAILED - Target not found');
}
