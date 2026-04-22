const fs = require('fs');
const f = 'frontend/src/pages/staff/CQIEntry.tsx';
let txt = fs.readFileSync(f, 'utf8');

// I will insert `const hasSsa1 = ...` before `students.forEach`
