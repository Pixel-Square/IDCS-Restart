import re

with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'r') as f:
    content = f.read()

content = content.replace(
"""          return {
            co1: scale(sums.co1, modelMaxes.co1, 2),
            co2: scale(sums.co2, modelMaxes.co2, 2),
            co3: scale(sums.co3, modelMaxes.co3, 2),
            co4: scale(sums.co4, modelMaxes.co4, 2),
            co5: scale(sums.co5, modelMaxes.co5, 4),
          };""", 
"""          return {
            co1: sums.co1,
            co2: sums.co2,
            co3: sums.co3,
            co4: sums.co4,
            co5: sums.co5,
          };"""
)

content = content.replace(
"""            if (modelScaled) {
              const k = `co${coNum}` as keyof typeof modelScaled;
              if (k in modelScaled) {
                meMark = Number((modelScaled as any)[k]);
                meMax = coNum === 5 ? 4 : 2;
              }
            }""",
"""            if (modelScaled) {
              const k = `co${coNum}` as keyof typeof modelScaled;
              if (k in modelScaled) {
                meMark = Number((modelScaled as any)[k]);
                meMax = (modelMaxes as any)[k] || 0;
              }
            }"""
)

with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'w') as f:
    f.write(content)

print("Patch applied to CQIEntry.tsx")
