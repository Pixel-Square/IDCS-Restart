import os
import sys
import django
import psycopg2
from io import StringIO

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "idcs.settings")
django.setup()
from django.db import connection

sql_file = '/tmp/lock_table.sql'

def import_locks():
    with open(sql_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.splitlines()
    
    current_table = None
    columns = []
    data_buffer = []
    
    with connection.cursor() as cur:
        # Disable all constraints (FKs, triggers, etc) for this session
        cur.execute("SET session_replication_role = 'replica';")
        
        for line in lines:
            if line.startswith('COPY public."OBE_obemarktablelock"'):
                parts = line.split('(')
                current_table = "OBE_obemarktablelock"
                col_part = parts[1].split(')')[0]
                columns = [c.strip().strip('"') for c in col_part.split(',')]
                data_buffer = []
                print(f"Reading table {current_table}...")
                
            elif current_table and line == '\\.':
                if data_buffer:
                    print(f"Importing {len(data_buffer)} rows into {current_table}...")
                    
                    temp_table = f"temp_{current_table.lower()}"
                    cur.execute(f"DROP TABLE IF EXISTS {temp_table}")
                    
                    col_names = ", ".join(f'"{c}"' for c in columns)
                    cur.execute(f"CREATE TEMP TABLE {temp_table} AS SELECT {col_names} FROM public.\"{current_table}\" LIMIT 0")
                    
                    csv_data = "\n".join(data_buffer) + "\n"
                    raw_conn = connection.connection
                    with raw_conn.cursor() as raw_cur:
                        raw_cur.copy_expert(f"COPY {temp_table} ({col_names}) FROM STDIN", StringIO(csv_data))
                    
                    try:
                        cur.execute(f"""
                            INSERT INTO public.\"{current_table}\" ({col_names})
                            SELECT {col_names} FROM {temp_table}
                            ON CONFLICT DO NOTHING;
                        """)
                    except Exception as e:
                        print(f"Error inserting into {current_table}: {e}")
                        
                    cur.execute(f"DROP TABLE {temp_table}")
                    
                current_table = None
                data_buffer = []
                
            elif current_table:
                data_buffer.append(line)
                
import_locks()
print("Import complete.")
