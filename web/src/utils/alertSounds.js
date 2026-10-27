// Siren tone and spoken announcement for new SOS alerts on the admin dashboard

// Short two-tone siren using the Web Audio API. Pass a ref so one AudioContext is reused.
export function playSirenTone(audioCtxRef) {
  if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
  const ctx = audioCtxRef.current;
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';

  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.setValueAtTime(660, now + 0.15);
  osc.frequency.setValueAtTime(880, now + 0.30);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  osc.start(now);
  osc.stop(now + 0.5);
}

// Speaks the alert with a real place name (never raw GPS numbers)
export async function speakEmergencyAlert(victimName, location, lat, lng) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();

    let placeName = location || '';

    // Check if location is raw GPS numbers, URL, or placeholder
    const isRawCoordinates =
      !placeName ||
      placeName.includes('GPS') ||
      placeName.includes('http') ||
      placeName.includes('maps.google') ||
      placeName.includes('Latitude') ||
      placeName.includes('அட்சரேகை') ||
      /^\s*[-+]?[0-9]*\.?[0-9]+\s*,\s*[-+]?[0-9]*\.?[0-9]+\s*$/.test(placeName);

    if (isRawCoordinates && lat && lng) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14`);
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          const town = addr.city || addr.town || addr.village || addr.suburb || addr.state_district || '';
          const state = addr.state || '';
          placeName = [town, state].filter(Boolean).join(', ');
        }
      } catch (_) {}
    }

    // Final fallback to clean human-readable place if still contains numbers
    if (!placeName || placeName.includes('GPS') || placeName.includes('http')) {
      placeName = (lat && lng) ? 'the location shown on the map' : 'a location not yet known';
    }

    const text = `Emergency SOS Alert! Victim ${victimName || 'User'} needs assistance at ${placeName}.`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // Steady, neat and clear voice cadence
    utterance.pitch = 1.05;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  } catch (_) {}
}
