with open("/home/iqac2/IDCS-Restart/backend/academics/urls.py") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "sections" in line or "my-students" in line:
        print(f"Line {i+1}: {line.strip()}")
