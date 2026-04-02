import re

with open("src/components/LabCourseMarksEntry.tsx", "r") as f:
    text = f.read()

# Fix visibleBtlIndices
text = re.sub(
    r"const v = m\.btl\[i\];\s*if \(v === 1 \|\| v === 2",
    r"const v = Number(m.btl[i] ?? 1);\n        if (v === 1 || v === 2",
    text
)

# Fix btlAvgByIndex in edit mode
text = re.sub(
    r"if \(m\.btl\[i\] === n\) \{",
    r"if (Number(m.btl[i] ?? 1) === n) {",
    text
)

with open("src/components/LabCourseMarksEntry.tsx", "w") as f:
    f.write(text)
