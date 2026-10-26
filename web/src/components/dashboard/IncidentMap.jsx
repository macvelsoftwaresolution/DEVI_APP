import React from 'react';
import { GoogleMap, OverlayView, Polyline, Circle } from '@react-google-maps/api';
import { createVictimDivIcon } from '../../utils/mapMarkers';
import { calcDistKm } from '../../utils/incidents';

// Static constants outside the component so re-renders do not reset the map position
const defaultMapCenter = { lat: 10.85, lng: 78.70 };
const defaultMapOptions = { disableDefaultUI: true, zoomControl: true };

// Map: incident markers, selected incident's movement trail and GPS accuracy circle
export default function IncidentMap({ isLoaded, incidents, selectedIncident, selectedIncidentId, onSelect, onMapLoad }) {
  return (
    <main style={{ flex: 1, height: '100%', position: 'relative', background: '#0B0E14' }}>
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={defaultMapCenter}
          zoom={8}
          onLoad={onMapLoad}
          options={defaultMapOptions}
        >
          {/* Incidents */}
          {incidents.map((inc) => {
            const lat = parseFloat(inc.latitude);
            const lng = parseFloat(inc.longitude);
            if (isNaN(lat) || isNaN(lng)) return null;
            const isSelected = selectedIncidentId === inc.id;
            return (
              <OverlayView
                key={inc.id}
                position={{ lat, lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={(width, height) => ({ x: -100, y: -85 })}
              >
                <div 
                  onClick={() => onSelect(inc.id)}
                  dangerouslySetInnerHTML={{ __html: createVictimDivIcon(inc, isSelected) }} 
                  style={{ cursor: 'pointer' }}
                />
              </OverlayView>
            );
          })}

          {/* Polylines for Selected Incident */}
          {selectedIncident && (() => {
             const vLat = parseFloat(selectedIncident.latitude);
             const vLng = parseFloat(selectedIncident.longitude);
             if (isNaN(vLat) || isNaN(vLng)) return null;

             return (
               <>
                 {/* Victim Movement Trail (Jitter Filtered, Glow & Direction Indicated) */}
                  {selectedIncident.breadcrumbs && selectedIncident.breadcrumbs.length > 1 && (() => {
                    const cleanTrail = [];
                    selectedIncident.breadcrumbs.forEach((b) => {
                      const lat = parseFloat(b.latitude);
                      const lng = parseFloat(b.longitude);
                      if (isNaN(lat) || isNaN(lng)) return;
                      const last = cleanTrail[cleanTrail.length - 1];
                      if (!last) {
                        cleanTrail.push({ lat, lng });
                      } else {
                        const dist = calcDistKm(last.lat, last.lng, lat, lng);
                        // Dynamic threshold: filter stationary jitter (< 3.5m) and impossible teleports (> 600m)
                        if (dist >= 0.0035 && dist <= 0.6) {
                          cleanTrail.push({ lat, lng });
                        }
                      }
                    });

                    // Ensure current live victim location is connected at the tip
                    if (cleanTrail.length > 0) {
                      const last = cleanTrail[cleanTrail.length - 1];
                      if (calcDistKm(last.lat, last.lng, vLat, vLng) >= 0.002) {
                        cleanTrail.push({ lat: vLat, lng: vLng });
                      }
                    }

                    if (cleanTrail.length <= 1) return null;

                    const arrowIcons = (window.google && window.google.maps) ? [{
                      icon: {
                        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        strokeColor: '#B91C1C',
                        fillColor: '#EF4444',
                        fillOpacity: 1,
                        scale: 2.2,
                        strokeWeight: 1,
                      },
                      offset: '100%',
                      repeat: '70px',
                    }] : [];

                    return (
                      <>
                        {/* Outer Ambient Glow Line */}
                        <Polyline 
                          path={cleanTrail} 
                          options={{ 
                            strokeColor: '#EF4444', 
                            strokeOpacity: 0.3, 
                            strokeWeight: 8, 
                            zIndex: 2 
                          }} 
                        />
                        {/* Sharp Core Polyline with Direction Arrows */}
                        <Polyline 
                          path={cleanTrail} 
                          options={{ 
                            strokeColor: '#EF4444', 
                            strokeOpacity: 0.95, 
                            strokeWeight: 4, 
                            icons: arrowIcons,
                            zIndex: 3 
                          }} 
                        />
                        {/* SOS Trigger Origin Point Marker */}
                        {cleanTrail.length > 1 && calcDistKm(cleanTrail[0].lat, cleanTrail[0].lng, vLat, vLng) >= 0.015 && (
                          <OverlayView
                            position={cleanTrail[0]}
                            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                            getPixelPositionOffset={() => ({ x: -14, y: -14 })}
                          >
                            <div 
                              title="SOS Trigger Point (Origin)"
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: '#10B981',
                                border: '2px solid #FFFFFF',
                                boxShadow: '0 0 12px rgba(16, 185, 129, 0.8)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                cursor: 'default',
                              }}
                            >
                              🏁
                            </div>
                          </OverlayView>
                        )}
                      </>
                    );
                  })()}

                  {/* GPS Accuracy Radius Circle around Victim Pin */}
                  <Circle
                    center={{ lat: vLat, lng: vLng }}
                    radius={Math.max(6, Math.min(45, parseFloat(selectedIncident.accuracy) || 12))}
                    options={{
                      fillColor: '#EF4444',
                      fillOpacity: 0.12,
                      strokeColor: '#EF4444',
                      strokeOpacity: 0.55,
                      strokeWeight: 1.5,
                      clickable: false,
                      zIndex: 1,
                    }}
                  />

               </>
             );
          })()}
        </GoogleMap>
      ) : (
        <div style={{color: 'white', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>Loading Google Maps...</div>
      )}
    </main>
  );
}
