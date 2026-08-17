with open("/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx") as f:
    lines = f.readlines()

print("=== Search Results for 'electiveParents' ===")
for i, line in enumerate(lines):
    if "electiveParents" in line or "electiveParent" in line or "is_dept_core" in line:
        print(f"Line {i+1}: {line.strip()}")
