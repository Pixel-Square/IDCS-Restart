import re

with open('../frontend/src/components/LabEntry.tsx', 'r') as f:
    content = f.read()

# in normalizeReviewComponents
content = re.sub(r"const max = clampInt\(Number\(item\.max \?\? 0\), 0, REVIEW_TOTAL_MAX\);", r"const max = clampInt(Number(item.max ?? 0), 0, maxTotal);", content)
content = re.sub(r"out\.push\(\{ id: makeReviewComponentId\(\), title: 'Title 1', max: REVIEW_TOTAL_MAX \}\);", r"out.push({ id: makeReviewComponentId(), title: 'Title 1', max: maxTotal });", content)

# in setReviewComponentMax
content = re.sub(
    r"const othersTotal = components\.reduce\(\(sum, component\) => sum \+ \(component\.id === componentId \? 0 : clampInt\(Number\(component\.max\), 0, REVIEW_TOTAL_MAX\)\), 0\);\s*const allowed = Math\.max\(0, REVIEW_TOTAL_MAX - othersTotal\);",
    r"const othersTotal = components.reduce((sum, component) => sum + (component.id === componentId ? 0 : clampInt(Number(component.max), 0, effectiveReviewMax)), 0);\n      const allowed = Math.max(0, effectiveReviewMax - othersTotal);",
    content
)

# in commitReviewComponentMax (approx. line 1163)
content = re.sub(
    r"\(\(sum, component\) => sum \+ \(component\.id === componentId \? 0 : clampInt\(Number\(component\.max\), 0, REVIEW_TOTAL_MAX\)\),\s*0,\s*\);\s*const allowed = Math\.max\(0, REVIEW_TOTAL_MAX - othersTotal\);",
    r"((sum, component) => sum + (component.id === componentId ? 0 : clampInt(Number(component.max), 0, effectiveReviewMax)), 0);\n    const allowed = Math.max(0, effectiveReviewMax - othersTotal);",
    content,
    flags=re.MULTILINE
)

# in addReviewComponent (approx. line 1177)
content = re.sub(
    r"const used = components\.reduce\(\(sum, component\) => sum \+ clampInt\(Number\(component\.max\), 0, REVIEW_TOTAL_MAX\), 0\);\s*const remaining = Math\.max\(0, REVIEW_TOTAL_MAX - used\);",
    r"const used = components.reduce((sum, component) => sum + clampInt(Number(component.max), 0, effectiveReviewMax), 0);\n      const remaining = Math.max(0, effectiveReviewMax - used);",
    content
)


with open('../frontend/src/components/LabEntry.tsx', 'w') as f:
    f.write(content)
