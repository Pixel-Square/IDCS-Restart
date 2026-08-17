with open("/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx") as f:
    content = f.read()

import re
# Find all occurrences of getDeptCoreParents or electiveParents
lines = content.splitlines()
for idx, line in enumerate(lines):
    if "is_dept_core" in line or "getDeptCoreParents" in line:
        print(f"Line {idx+1}: {line}")
