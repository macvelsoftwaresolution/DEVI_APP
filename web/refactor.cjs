const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.jsx', 'utf8');

code = code.replace(/import L from 'leaflet';/, "import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from '@react-google-maps/api';");

code = code.replace(/\/\/ Initialize Map[\s\S]*?\}, \[\]\);/m, '');

code = code.replace(/const smoothFlyTo = [\s\S]*?\}, 2900\);\n  };/m, `const smoothFlyTo = (lat, lng, zoom = 17) => {
    if (mapInstanceRef.current && !isNaN(lat) && !isNaN(lng)) {
      mapInstanceRef.current.panTo({ lat, lng });
      mapInstanceRef.current.setZoom(zoom);
    }
  };`);

code = code.replace(/\/\/ Update Incident Map Markers[\s\S]*?\}, \[incidents, selectedIncidentId\]\);/m, '');
code = code.replace(/\/\/ Update Responder Map Markers[\s\S]*?\}, \[responders, showResponders\]\);/m, '');

code = code.replace(/\/\/ Selected Incident Focus[\s\S]*?\}, \[\n    selectedIncidentId,[\s\S]*?responders,\n  \]\);/m, `// Selected Incident Focus
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);

  useEffect(() => {
    if (!selectedIncident) return;
    const vLat = parseFloat(selectedIncident.latitude);
    const vLng = parseFloat(selectedIncident.longitude);
    if (!isNaN(vLat) && !isNaN(vLng) && !isFlyingRef.current) {
      smoothFlyTo(vLat, vLng, 17);
    }
    setOperatorNote(selectedIncident.operatorNotes || '');
  }, [
    selectedIncidentId,
    selectedIncident?.latitude,
    selectedIncident?.longitude,
    selectedIncident?.assignedAgent,
    selectedIncident?.responderStatus,
  ]);`);

code = code.replace(/const generateRandomPin = /m, `const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });\n\n  const generateRandomPin = `);

let renderMap = `<main style={{ flex: 1, height: '100%', position: 'relative', background: '#0B0E14' }}>
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={{ lat: 10.85, lng: 78.70 }}
              zoom={8}
              onLoad={(map) => { mapInstanceRef.current = map; }}
              options={{ disableDefaultUI: true, zoomControl: true }}
            >
              {/* Incidents */}
              {incidents.map((inc) => {
                const lat = parseFloat(inc.latitude);
                const lng = parseFloat(inc.longitude);
                if (isNaN(lat) || isNaN(lng)) return null;
                const isEmergency = inc.status === 'DISPATCHED' || inc.status === 'ACTIVE';
                return (
                  <Marker
                    key={inc.id}
                    position={{ lat, lng }}
                    onClick={() => setSelectedIncidentId(inc.id)}
                    icon={{
                      path: window.google.maps.SymbolPath.CIRCLE,
                      scale: isEmergency ? 8 : 6,
                      fillColor: isEmergency ? '#EF4444' : '#F59E0B',
                      fillOpacity: 1,
                      strokeColor: '#FFF',
                      strokeWeight: 2,
                    }}
                  />
                );
              })}
              
              {/* Responders */}
              {showResponders && responders.map((r) => {
                const lat = parseFloat(r.latitude);
                const lng = parseFloat(r.longitude);
                if (isNaN(lat) || isNaN(lng)) return null;
                const isOnDuty = r.duty_status === 'ON_DUTY';
                return (
                  <Marker
                    key={r.id}
                    position={{ lat, lng }}
                    icon={{
                      path: window.google.maps.SymbolPath.CIRCLE,
                      scale: 7,
                      fillColor: isOnDuty ? '#10B981' : '#64748B',
                      fillOpacity: 1,
                      strokeColor: '#FFF',
                      strokeWeight: 2,
                    }}
                  />
                );
              })}

              {/* Polylines for Selected Incident */}
              {selectedIncident && (() => {
                 const vLat = parseFloat(selectedIncident.latitude);
                 const vLng = parseFloat(selectedIncident.longitude);
                 if (isNaN(vLat) || isNaN(vLng)) return null;
                 
                 let rLat, rLng;
                 let isEnRoute = false;
                 if (selectedIncident.assignedAgent) {
                   const assignedResp = responders.find(r => 
                     selectedIncident.assignedAgent.toLowerCase().includes(r.name.toLowerCase()) || 
                     (r.phone && selectedIncident.assignedAgent.includes(r.phone.slice(-10)))
                   );
                   if (assignedResp) {
                     rLat = parseFloat(assignedResp.latitude);
                     rLng = parseFloat(assignedResp.longitude);
                     isEnRoute = selectedIncident.responderStatus === 'EN_ROUTE';
                   }
                 }

                 return (
                   <>
                     {selectedIncident.breadcrumbs && selectedIncident.breadcrumbs.length > 1 && (
                       <Polyline 
                         path={selectedIncident.breadcrumbs.map(b => ({lat: parseFloat(b.latitude), lng: parseFloat(b.longitude)})).filter(p => !isNaN(p.lat) && !isNaN(p.lng))} 
                         options={{ strokeColor: '#EF4444', strokeWeight: 4 }} 
                       />
                     )}
                     {!isNaN(rLat) && !isNaN(rLng) && (
                       <Polyline 
                         path={[{lat: rLat, lng: rLng}, {lat: vLat, lng: vLng}]} 
                         options={{ strokeColor: isEnRoute ? '#10B981' : '#38BDF8', strokeWeight: 5 }} 
                       />
                     )}
                   </>
                 );
              })()}
            </GoogleMap>
          ) : (
            <div style={{color: 'white', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>Loading Google Maps...</div>
          )}
        </main>`;

code = code.replace(/<main style=\{\{ flex: 1, height: '100%', position: 'relative', background: '#0B0E14' \}\}>\s*<div ref=\{mapContainerRef\} style=\{\{ width: '100%', height: '100%' \}\}><\/div>\s*<\/main>/m, renderMap);

fs.writeFileSync('src/pages/DashboardPage.jsx', code);
console.log('done');
