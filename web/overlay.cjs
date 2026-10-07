const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.jsx', 'utf8');

code = code.replace(/import \{ GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow \} from '@react-google-maps\/api';/, "import { GoogleMap, useJsApiLoader, OverlayView, Polyline } from '@react-google-maps/api';");

code = code.replace(/<Marker[\s\S]*?key=\{inc\.id\}[\s\S]*?position=\{\{ lat, lng \}\}[\s\S]*?onClick=\{[\s\S]*?\}[\s\S]*?icon=\{[\s\S]*?\}[\s\S]*?\/>/g, `<OverlayView
                    key={inc.id}
                    position={{ lat, lng }}
                    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                    getPixelPositionOffset={(width, height) => ({ x: -100, y: -85 })}
                  >
                    <div 
                      onClick={() => setSelectedIncidentId(inc.id)}
                      dangerouslySetInnerHTML={{ __html: createVictimDivIcon(inc, isSelected) }} 
                      style={{ cursor: 'pointer' }}
                    />
                  </OverlayView>`);

code = code.replace(/<Marker[\s\S]*?key=\{r\.id\}[\s\S]*?position=\{\{ lat, lng \}\}[\s\S]*?icon=\{[\s\S]*?\}[\s\S]*?\/>/g, `<OverlayView
                    key={r.id}
                    position={{ lat, lng }}
                    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                    getPixelPositionOffset={(width, height) => ({ x: -90, y: -75 })}
                  >
                    <div 
                      dangerouslySetInnerHTML={{ __html: createResponderDivIcon(r, false) }} 
                    />
                  </OverlayView>`);

fs.writeFileSync('src/pages/DashboardPage.jsx', code);
console.log('done OverlayView');
