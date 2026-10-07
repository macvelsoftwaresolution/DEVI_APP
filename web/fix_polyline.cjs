const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.jsx', 'utf8');

const regex = /\{!isNaN\(rLat\) && !isNaN\(rLng\) && \(\s*<Polyline\s*path=\{\[\{lat: rLat, lng: rLng\}, \{lat: vLat, lng: vLng\}\]\}\s*options=\{\{ strokeColor: isEnRoute \? '#10B981' : '#38BDF8', strokeWeight: 5 \}\}\s*\/>\s*\)\}/m;

const replacement = `{!isNaN(rLat) && !isNaN(rLng) && (
                         <>
                           <Polyline 
                             path={[{lat: rLat, lng: rLng}, {lat: vLat, lng: vLng}]} 
                             options={{ strokeColor: isEnRoute ? '#10B981' : '#38BDF8', strokeWeight: 5 }} 
                           />
                           <OverlayView
                             position={{ lat: (rLat + vLat) / 2, lng: (rLng + vLng) / 2 }}
                             mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                             getPixelPositionOffset={(width, height) => ({ x: -(width / 2), y: -(height / 2) })}
                           >
                             <div style={{ background: '#0F172A', border: '1px solid #1E293B', padding: '6px 12px', borderRadius: '8px', textAlign: 'center', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                               <span style={{ fontSize: '11px', fontWeight: '800', color: isEnRoute ? '#34D399' : '#38BDF8' }}>
                                 {isEnRoute ? '🚀 EN ROUTE TO SCENE' : '⚡ ASSIGNED RESPONDER'}
                               </span><br/>
                               <span style={{ fontSize: '10px', color: '#E2E8F0' }}>{assignedResp.name} ➔ {selectedIncident.user?.name || 'Victim'}</span><br/>
                               <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold', color: '#FFF' }}>
                                 ~{(() => {
                                    const d = calcDistKm(rLat, rLng, vLat, vLng);
                                    return d < 1 ? \`\${Math.round(d * 1000)} m\` : \`\${d.toFixed(2)} km\`;
                                 })()} (~{Math.max(1, Math.round(calcDistKm(rLat, rLng, vLat, vLng) * 2.5))}m away)
                               </span>
                             </div>
                           </OverlayView>
                         </>
                       )}`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/DashboardPage.jsx', code);
