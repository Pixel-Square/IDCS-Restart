with open("/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx") as f:
    lines = f.readlines()

print("=== Search Results for 'selectedDept' ===")
for i, line in enumerate(lines):
    if "selectedDept" in line:
        print(f"Line {i+1}: {line.strip()}")
