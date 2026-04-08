// Let's create a script to read StudentsList.tsx and print the relevant code near first useEffect
const fs = require('fs');
const content = fs.readFileSync('/home/iqac/IDCS-Restart/coe/src/pages/COE/StudentsList.tsx', 'utf8');
const lines = content.split('\n');
for (let i = 480; i < 550; i++) {
  // console.log(`${i+1}: ${lines[i]}`);
}
