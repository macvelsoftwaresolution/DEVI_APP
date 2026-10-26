// Reverse geocoding: GPS coordinates -> human-readable place name (cached)
export const GeocodeService = {
  // In-memory reverse geocoding cache
  geocodeCache: new Map(),

  // Reverse Geocode GPS coordinates to human-readable address name (e.g. Sivakasi, Tamil Nadu)
  async reverseGeocode(lat, lng) {
    if (!lat || !lng) return null;
    const cacheKey = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
    if (this.geocodeCache.has(cacheKey)) {
      return this.geocodeCache.get(cacheKey);
    }

    // Provider 0: Google Maps Geocoding API (Fastest & Most Accurate in India)
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (googleMapsKey) {
      try {
        const gRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleMapsKey}`, {
          signal: AbortSignal.timeout(3500),
        });
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.status === 'OK' && gData.results && gData.results.length > 0) {
            const formatted = gData.results[0].formatted_address;
            if (formatted) {
              this.geocodeCache.set(cacheKey, formatted);
              return formatted;
            }
          }
        }
      } catch (_) { }
    }

    // Provider 1: OpenStreetMap Nominatim (Fallback)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'User-Agent': 'DEVI-Women-Safety-ReverseGeocode/1.0' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.address) {
          const addr = data.address;
          const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
          const town = addr.city || addr.town || addr.village || addr.county || addr.state_district || '';
          const state = addr.state || '';
          const parts = [road, town, state].filter(Boolean);
          const result = parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 3).join(', ');
          if (result) {
            this.geocodeCache.set(cacheKey, result);
            return result;
          }
        }
      }
    } catch (_) { }

    // Provider 2: BigDataCloud Free Client API (Fast Fallback)
    try {
      const bdcRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`, {
        signal: AbortSignal.timeout(3000),
      });
      if (bdcRes.ok) {
        const bdcData = await bdcRes.json();
        const locality = bdcData.locality || bdcData.city || bdcData.principalSubdivision || '';
        const district = bdcData.localityInfo?.administrative?.[2]?.name || bdcData.principalSubdivision || '';
        const state = bdcData.principalSubdivision || 'Tamil Nadu';
        const parts = Array.from(new Set([locality, district, state].filter(Boolean)));
        if (parts.length > 0) {
          const result = parts.join(', ');
          this.geocodeCache.set(cacheKey, result);
          return result;
        }
      }
    } catch (_) { }

    return null;
  },
};
