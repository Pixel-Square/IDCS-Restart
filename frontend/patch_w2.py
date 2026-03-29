import re

with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "components.push({ key: 'me', mark: meMark, max: meMax, w: meMax });",
    "const meWeight = (!isLabLike && modelScaled) ? (coNum === 5 ? 4 : 2) : meMax;\n              components.push({ key: 'me', mark: meMark, max: meMax, w: meWeight });"
)

with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'w') as f:
    f.write(content)

print("Patch applied to CQIEntry.tsx")
