import re

with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'r') as f:
    content = f.read()

content = content.replace(
"""            if (meMark !== null && meMax > 0) {
              // For local model sheets: meMax is already 2/4 and mark is scaled to that; set w=meMax so contrib==mark.
              // For lab-like: meMax is the CO_MAX; treat it like a regular component with weight equal to meMax.
              components.push({ key: 'me', mark: meMark, max: meMax, w: meMax });
            }""", 
"""            if (meMark !== null && meMax > 0) {
              // For local model sheets: meMax is raw max, so set weight appropriately (4 for CO5, 2 otherwise).
              // For lab-like: meMax is the CO_MAX; treat it like a regular component with weight equal to meMax.
              const meWeight = (!isLabLike && modelScaled) ? (coNum === 5 ? 4 : 2) : meMax;
              components.push({ key: 'me', mark: meMark, max: meMax, w: meWeight });
            }"""
)

# Alternative replacement with more robust matching
import re
content = re.sub(
    r"if \(meMark !== null && meMax > 0\) \{\n\s*//[^\n]+\n\s*//[^\n]+\n\s*components.push\(\{ key: 'me', mark: meMark, max: meMax, w: meMax \}\);\n\s*\}",
    """if (meMark !== null && meMax > 0) {
              // For local model sheets: meMax is raw max, so set weight appropriately (4 for CO5, 2 otherwise).
              // For lab-like: meMax is the CO_MAX; treat it like a regular component with weight equal to meMax.
              const meWeight = (!isLabLike && modelScaled) ? (coNum === 5 ? 4 : 2) : meMax;
              components.push({ key: 'me', mark: meMark, max: meMax, w: meWeight });
            }""",
    content
)

with open('/home/iqac/IDCS-Restart/frontend/src/pages/staff/CQIEntry.tsx', 'w') as f:
    f.write(content)

print("Patch applied to CQIEntry.tsx")
