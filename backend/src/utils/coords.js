// Coordinates are either a real GPS reading or null. Never substitute a default city.
// 0,0 is treated as "no fix": it is the placeholder written when the DB column is NOT NULL,
// and no DEVI user is ever at that point in the Atlantic.

export const NO_FIX_PLACEHOLDER = 0;

export const toCoord = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

// Returns { latitude, longitude } as numbers, or both null when there is no real fix
export const toLatLng = (latitude, longitude) => {
  const lat = toCoord(latitude);
  const lng = toCoord(longitude);
  if (lat === null || lng === null) return { latitude: null, longitude: null };
  if (lat === 0 && lng === 0) return { latitude: null, longitude: null };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { latitude: null, longitude: null };
  return { latitude: lat, longitude: lng };
};

export const hasFix = (latitude, longitude) => toLatLng(latitude, longitude).latitude !== null;

// Breadcrumb trail starts empty when there is no fix yet
export const initialBreadcrumbs = (latitude, longitude, timestamp) =>
  hasFix(latitude, longitude) ? [{ latitude, longitude, timestamp }] : [];
