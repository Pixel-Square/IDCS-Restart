with open("/home/iqac2/IDCS-Restart/frontend/src/pages/hod/TeachingAssignments.tsx") as f:
    lines = f.readlines()

print("=== Search Results for API Save Calls ===")
for i, line in enumerate(lines):
    if "fetchWithAuth" in line and ("POST" in line or "PUT" in line or "PATCH" in line or "delete" in line.lower() or "method" in line):
        print(f"Line {i+1}: {line.strip()}")
        # print next 3 lines
        for j in range(1, 4):
            if i + j < len(lines):
                print(f"  {lines[i+j].strip()}")
