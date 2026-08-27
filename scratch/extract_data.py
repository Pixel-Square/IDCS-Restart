import sys

dump_path = "/home/iqac/IDCS-Restart/old_academic_structure_dump.sql"
output_path = "/home/iqac/IDCS-Restart/old_academic_structure_data.sql"

print(f"Reading dump file: {dump_path}")
print(f"Writing data-only SQL file to: {output_path}")

header = """--
-- Data-only dump for legacy academics and marks tables
--
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Disable all constraints and triggers for seamless out-of-order import
SET session_replication_role = 'replica';

"""

footer = """
-- Re-enable all constraints and triggers
SET session_replication_role = 'origin';
"""

tables_processed = []
copy_block_count = 0

with open(dump_path, "r", encoding="utf-8", errors="ignore") as infile, \
     open(output_path, "w", encoding="utf-8") as outfile:
    
    outfile.write(header)
    
    in_copy = False
    for line in infile:
        if line.startswith("COPY public."):
            in_copy = True
            copy_block_count += 1
            # Extract table name for logging
            parts = line.split()
            if len(parts) > 1:
                table_name = parts[1].replace("public.", "").replace('"', '')
                tables_processed.append(table_name)
                print(f"Extracting table: {table_name}")
            outfile.write(line)
        elif in_copy:
            outfile.write(line)
            if line.strip() == "\\.":
                in_copy = False
                outfile.write("\n")
                
    outfile.write(footer)

print("\nExtraction complete!")
print(f"Total tables extracted: {len(tables_processed)}")
print(f"Total COPY blocks processed: {copy_block_count}")
