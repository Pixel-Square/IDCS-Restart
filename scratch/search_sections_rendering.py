with open("/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx") as f:
    lines = f.readlines()

print("=== Search Results for sections mapping or getSectionSubjects ===")
for i, line in enumerate(lines):
    if "getSectionSubjects" in line or "sections.map" in line or "sections.filter" in line:
        print(f"Line {i+1}: {line.strip()}")
