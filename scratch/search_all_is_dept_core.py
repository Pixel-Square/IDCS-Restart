import os

print("=== Search Results for 'is_dept_core' in Python files ===")
for root, dirs, files in os.walk("/home/iqac2/IDCS-Restart"):
    if ".venv" in dirs:
        dirs.remove(".venv")
    if ".git" in dirs:
        dirs.remove(".git")
    for file in files:
        if file.endswith(".py"):
            path = os.path.join(root, file)
            try:
                with open(path, errors='ignore') as f:
                    for i, line in enumerate(f):
                        if "is_dept_core" in line:
                            print(f"{path}:L{i+1}: {line.strip()}")
            except Exception as e:
                pass
