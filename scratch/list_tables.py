import re

dump_path = "/home/iqac/IDCS-Restart/old_academic_structure_dump.sql"
tables = []
with open(dump_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if line.startswith("COPY public."):
            tables.append(line.strip())

print(f"Found {len(tables)} COPY statements:")
for t in tables:
    print(t)
