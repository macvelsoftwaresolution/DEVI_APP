const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.jsx', 'utf8');

const replacement = `  // Selected Incident Focus
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);

  useEffect(() => {
    if (selectedIncident) {
      setOperatorNote(selectedIncident.operatorNotes || '');
    }
  }, [selectedIncidentId, selectedIncident?.operatorNotes]);`;

const startIdx = code.indexOf('  // Selected Incident Focus');
const endStr = 'responders,\n  ]);';
const endIdx = code.indexOf(endStr, startIdx) + endStr.length;

if (startIdx !== -1 && endIdx !== -1) {
  code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
  fs.writeFileSync('src/pages/DashboardPage.jsx', code);
  console.log('SUCCESS');
} else {
  console.log('FAILED');
}
