const fs = require('fs');
const hecPath = '/home/talha/FYP- project/frontend/src/pages/hec/VerifiedDegrees.js';
const approverPath = '/home/talha/FYP- project/frontend/src/pages/approver/ApproverDashboard.js';

let hecCode = fs.readFileSync(hecPath, 'utf8');
hecCode = hecCode.replace(/const directUrl = `\$\{baseUrl\}\/api\/degrees\/hec\/\$\{degree\.degreeId\}\/pdf\?token=\$\{encodeURIComponent\(token\)\}`;/,
`const directUrl = \`/api/degrees/hec/\${degree.degreeId}/pdf?token=\${encodeURIComponent(token)}\`;`);
fs.writeFileSync(hecPath, hecCode);

let apprCode = fs.readFileSync(approverPath, 'utf8');
apprCode = apprCode.replace(/const directUrl = `\$\{baseUrl\}\/api\/approver\/degrees\/\$\{degree\.degreeId\}\/pdf\?token=\$\{encodeURIComponent\(token\)\}`;/,
`const directUrl = \`/api/approver/degrees/\${degree.degreeId}/pdf?token=\${encodeURIComponent(token)}\`;`);
fs.writeFileSync(approverPath, apprCode);

console.log("Replaced with relative URLs!");
