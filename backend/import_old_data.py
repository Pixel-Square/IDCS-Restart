import os
import sys
import django
import psycopg2
from urllib.parse import urlparse
from io import StringIO

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "idcs.settings")
django.setup()
from django.db import connection

sql_file = '/home/iqac2/Desktop/idcs-mt/old_academic_structure_data.sql'

def import_dump_via_temp_tables():
    with open(sql_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into lines
    lines = content.splitlines()
    
    current_table = None
    columns = []
    data_buffer = []
    
    with connection.cursor() as cur:
        # First, set defaults for known problematic columns to avoid NOT NULL errors during temp table creation
        cur.execute("ALTER TABLE academics_staffprofile ALTER COLUMN pbas_credit SET DEFAULT 0")
        cur.execute("ALTER TABLE academics_studentprofile ALTER COLUMN pbas_credit SET DEFAULT 0")
        
        for line in lines:
            if line.startswith('COPY '):
                # e.g. COPY public."OBE_cia1mark" (id, mark) FROM stdin;
                parts = line.split('(')
                table_part = parts[0].replace('COPY public.', '').replace('COPY ', '').strip().strip('"')
                col_part = parts[1].split(')')[0]
                
                current_table = table_part
                columns = [c.strip().strip('"') for c in col_part.split(',')]
                data_buffer = []
                print(f"Reading table {current_table}...")
                
            elif current_table and line == '\\.':
                # End of COPY block, flush data
                if data_buffer:
                    print(f"Importing {len(data_buffer)} rows into {current_table}...")
                    
                    # 1. Create temp table
                    temp_table = f"temp_{current_table.lower()}"
                    cur.execute(f"DROP TABLE IF EXISTS {temp_table}")
                    
                    col_names = ", ".join(f'"{c}"' for c in columns)
                    cur.execute(f"CREATE TEMP TABLE {temp_table} AS SELECT {col_names} FROM public.\"{current_table}\" LIMIT 0")
                    
                    # 2. Copy data into temp table using psycopg2's copy_expert
                    csv_data = "\n".join(data_buffer) + "\n"
                    # We need to access the raw psycopg2 cursor
                    raw_conn = connection.connection
                    with raw_conn.cursor() as raw_cur:
                        raw_cur.copy_expert(f"COPY {temp_table} ({col_names}) FROM STDIN", StringIO(csv_data))
                    
                    # 3. Insert from temp table to actual table with ON CONFLICT DO NOTHING
                    # To do this safely, we need to know the primary key or unique constraints.
                    # DO NOTHING without target ignores all conflicts (unique, etc.)
                    # Note: INSERT ... ON CONFLICT DO NOTHING (without target) is perfectly valid in Postgres
                    try:
                        cur.execute(f"""
                            INSERT INTO public.\"{current_table}\" ({col_names})
                            SELECT {col_names} FROM {temp_table}
                            ON CONFLICT DO NOTHING;
                        """)
                    except Exception as e:
                        print(f"Error inserting into {current_table}: {e}")
                        
                    # Clean up
                    cur.execute(f"DROP TABLE {temp_table}")
                    
                current_table = None
                data_buffer = []
                
            elif current_table:
                data_buffer.append(line)
                
import_dump_via_temp_tables()
print("Import complete.")
