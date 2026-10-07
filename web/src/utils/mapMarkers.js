// Custom High-Visibility Map Markers for DEVI Emergency Response Network
// Ultra-distinct markers for SOS Victims and Safety Responders that stand out over Satellite imagery

export function createVictimDivIcon(inc = {}, isSelected = false) {
  const status = (inc.status || 'ACTIVE').toUpperCase();
  const name = inc.user?.name || inc.userName || 'DEVI Victim';
  
  // Safe HTML escaping
  const safeName = String(name)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  
  let statusClass = 'active';
  let statusText = 'LIVE SOS';
  let pinIcon = '🚨';
  let gradTop = '#EF4444';
  let gradBottom = '#991B1B';

  if (status === 'DISPATCHED' || status === 'ASSIGNED') {
    statusClass = 'dispatched';
    statusText = inc.assignedAgent ? `HELP: ${inc.assignedAgent}` : 'HELP EN ROUTE';
    pinIcon = '⚡';
    gradTop = '#F59E0B';
    gradBottom = '#B45309';
  } else if (status === 'RESOLVED') {
    statusClass = 'resolved';
    statusText = 'SAFE';
    pinIcon = '✅';
    gradTop = '#10B981';
    gradBottom = '#047857';
  }

  const selectedClass = isSelected ? 'selected-marker' : '';
  const gradId = `vGrad_${String(inc.id || 'default').replace(/[^a-zA-Z0-9]/g, '_')}`;

  const html = `
    <div class="devi-marker-wrapper victim ${statusClass} ${selectedClass}">
      <div class="devi-sos-radar-center">
        <div class="devi-radar-ring ring-1"></div>
        <div class="devi-radar-ring ring-2"></div>
        <div class="devi-radar-ring ring-3"></div>
      </div>
      <div class="devi-marker-pill ${statusClass}">
        <span class="pill-dot"></span>
        <span class="pill-name">SOS: ${safeName}</span>
        <span class="pill-tag">${statusText}</span>
      </div>
      <div class="devi-victim-pin-body">
        <svg class="devi-pin-svg" viewBox="0 0 46 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="${gradId}" x1="23" y1="0" x2="23" y2="47" gradientUnits="userSpaceOnUse">
              <stop stop-color="${gradTop}"/>
              <stop offset="1" stop-color="${gradBottom}"/>
            </linearGradient>
          </defs>
          <path d="M23 47C23 47 42 30.5 42 19C42 8.50659 33.4934 0 23 0C12.5066 0 4 8.50659 4 19C4 30.5 23 47 23 47Z" fill="url(#${gradId})" stroke="#FFFFFF" stroke-width="2.5"/>
          <circle cx="23" cy="18" r="14" fill="#FFFFFF" fill-opacity="0.22"/>
        </svg>
        <span class="devi-pin-icon">${pinIcon}</span>
      </div>
    </div>
  `;

  // Window.L is Leaflet loaded via CDN in index.html
  return html;
}

export function createResponderDivIcon(agent = {}, isSelected = false) {
  const name = agent.name || 'Safety Responder';
  const safeName = String(name)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  
  const rawStatus = String(agent.duty_status || agent.status || '').toUpperCase();
  const isOnDuty = agent.is_on_duty === true || rawStatus === 'ON_DUTY' || rawStatus === 'ON-DUTY' || rawStatus === 'ACTIVE' || rawStatus === 'AVAILABLE';
  const isPending = rawStatus === 'PENDING_APPROVAL' || rawStatus === 'PENDING';
  const isEnRoute = rawStatus === 'EN_ROUTE' || rawStatus === 'DISPATCHED';

  let statusText = 'OFF-DUTY';
  let statusClass = 'off-duty';
  let gradTop = '#64748B';
  let gradBottom = '#334155';

  if (isEnRoute) {
    statusText = 'EN-ROUTE';
    statusClass = 'en-route';
    gradTop = '#10B981';
    gradBottom = '#047857';
  } else if (isOnDuty) {
    statusText = 'ON-DUTY';
    statusClass = 'on-duty';
    gradTop = '#0EA5E9';
    gradBottom = '#0369A1';
  } else if (isPending) {
    statusText = 'PENDING';
    statusClass = 'pending';
    gradTop = '#F59E0B';
    gradBottom = '#B45309';
  }
  
  let emblemIcon = '🛡️';
  if (agent.vehicle) {
    const v = agent.vehicle.toLowerCase();
    if (v.includes('bike') || v.includes('motor') || v.includes('scooter')) emblemIcon = '🏍️';
    else if (v.includes('car') || v.includes('patrol') || v.includes('van')) emblemIcon = '🚓';
  }

  const selectedClass = isSelected ? 'selected-marker' : '';
  const gradId = `aGrad_${String(agent.id || 'default').replace(/[^a-zA-Z0-9]/g, '_')}`;

  const html = `
    <div class="devi-marker-wrapper responder ${statusClass} ${selectedClass}">
      <div class="devi-agent-radar-center">
        <div class="devi-agent-ring"></div>
      </div>
      <div class="devi-agent-pill ${statusClass}">
        <span class="pill-icon">${emblemIcon}</span>
        <span class="pill-name">${safeName}</span>
        <span class="pill-tag">${statusText}</span>
      </div>
      <div class="devi-agent-shield-body">
        <svg class="devi-shield-svg" viewBox="0 0 42 46" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="${gradId}" x1="21" y1="1" x2="21" y2="45" gradientUnits="userSpaceOnUse">
              <stop stop-color="${gradTop}"/>
              <stop offset="1" stop-color="${gradBottom}"/>
            </linearGradient>
          </defs>
          <path d="M21 45C21 45 39 36 39 21V7L21 1L3 7V21C3 36 21 45 21 45Z" fill="url(#${gradId})" stroke="#FFFFFF" stroke-width="2.5"/>
          <circle cx="21" cy="19" r="13" fill="#FFFFFF" fill-opacity="0.2"/>
        </svg>
        <span class="devi-shield-icon">${emblemIcon}</span>
      </div>
    </div>
  `;

  return html;
}

export function createGuardianDivIcon() {
  const html = `
    <div class="devi-marker-wrapper responder on-duty">
      <div class="devi-agent-radar-center">
        <div class="devi-agent-ring"></div>
      </div>
      <div class="devi-agent-pill on-duty">
        <span class="pill-icon">📍</span>
        <span class="pill-name">YOU (GUARDIAN)</span>
        <span class="pill-tag">LIVE GPS</span>
      </div>
      <div class="devi-agent-shield-body">
        <svg class="devi-shield-svg" viewBox="0 0 42 46" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gGradLive" x1="21" y1="1" x2="21" y2="45" gradientUnits="userSpaceOnUse">
              <stop stop-color="#10B981"/>
              <stop offset="1" stop-color="#047857"/>
            </linearGradient>
          </defs>
          <path d="M21 45C21 45 39 36 39 21V7L21 1L3 7V21C3 36 21 45 21 45Z" fill="url(#gGradLive)" stroke="#FFFFFF" stroke-width="2.5"/>
          <circle cx="21" cy="19" r="13" fill="#FFFFFF" fill-opacity="0.2"/>
        </svg>
        <span class="devi-shield-icon">🏃</span>
      </div>
    </div>
  `;

  return html;
}
