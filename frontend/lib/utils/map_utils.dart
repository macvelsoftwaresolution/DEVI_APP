/// Location link helpers used in SOS alerts.
class MapUtils {
  MapUtils._();

  /// Generates a standard Google Maps URL from latitude and longitude.
  static String getGoogleMapsUrl(double latitude, double longitude) {
    return 'https://maps.google.com/?q=$latitude,$longitude';
  }
}
