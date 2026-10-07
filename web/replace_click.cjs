const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.jsx', 'utf8');

code = code.replace(/onClick=\{\(\) => setShowAgentsListModal\(true\)\}/g, "onClick={() => window.location.href = '/agents'}");

fs.writeFileSync('src/pages/DashboardPage.jsx', code);
console.log('done replacing onClick');
