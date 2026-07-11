with open("/home/iqac2/IDCS-Restart/patch_script.py") as f:
    lines = f.readlines()

print("=== Search Results in patch_script.py ===")
for i, line in enumerate(lines):
    if "is_dept_core" in line or "GEA1105" in line or "Graphics" in line:
        print(f"Line {i+1}: {line.strip()}")
