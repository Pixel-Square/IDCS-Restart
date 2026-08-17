with open("/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx") as f:
    lines = f.readlines()

print("=== Search Results for 'useEffect' ===")
for i, line in enumerate(lines):
    if "useEffect" in line:
        print(f"Line {i+1}: {line.strip()}")
        # print next 5 lines
        for j in range(1, 6):
            if i + j < len(lines):
                print(f"  {lines[i+j].strip()}")
