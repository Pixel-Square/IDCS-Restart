with open("/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx") as f:
    lines = f.readlines()

print("=== Search Results for 'setSelectedDept' ===")
for i, line in enumerate(lines):
    if "setSelectedDept" in line:
        print(f"Line {i+1}: {line.strip()}")
