import re

dump_path = "/home/iqac/IDCS-Restart/old_academic_structure_dump.sql"
tables = []
with open(dump_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if line.startswith("COPY public."):
            parts = line.split()
            if len(parts) > 1:
                table_name = parts[1].replace("public.", "").replace('"', '')
                tables.append(table_name)

obe_tables = [t for t in tables if "obe" in t.lower()]
print(f"Found {len(obe_tables)} OBE tables out of {len(tables)} total tables:")
for t in sorted(obe_tables):
    print(f" - {t}")
