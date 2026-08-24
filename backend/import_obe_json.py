import os
import json
import django
from django.db import connection

def import_obe_data():
    try:
        with connection.cursor() as cur:
            cur.execute("SET session_replication_role = 'replica';")
            
            with open('/home/iqac2/Desktop/idcs-mt/obe_data.json', 'r') as f:
                data = json.load(f)
                
            for table_name, rows in data.items():
                if not rows: continue
                    
                print(f"Importing {len(rows)} rows into {table_name}...")
                row_list = list(rows.values()) if isinstance(rows, dict) else rows
                if not row_list: continue
                    
                # Clean up unique constraints
                if table_name == 'OBE_assessmentdraft':
                    for r in row_list:
                        cur.execute('''DELETE FROM public."OBE_assessmentdraft" WHERE subject_id = %s AND assessment = %s AND teaching_assignment_id = %s AND id != %s''', (r.get('subject_id'), r.get('assessment'), r.get('teaching_assignment_id'), r.get('id')))
                elif table_name == 'OBE_labexamcomark':
                    for r in row_list:
                        cur.execute('''DELETE FROM public."OBE_labexamcomark" WHERE lab_exam_mark_id = %s AND co_num = %s AND id != %s''', (r.get('lab_exam_mark_id'), r.get('co_num'), r.get('id')))
                elif table_name == 'OBE_modelexamcomark':
                    for r in row_list:
                        cur.execute('''DELETE FROM public."OBE_modelexamcomark" WHERE model_exam_mark_id = %s AND co_num = %s AND id != %s''', (r.get('model_exam_mark_id'), r.get('co_num'), r.get('id')))
                elif table_name == 'OBE_obemarktablelock':
                    for r in row_list:
                        cur.execute('''DELETE FROM public."OBE_obemarktablelock" WHERE teaching_assignment_id = %s AND assessment = %s AND id != %s''', (r.get('teaching_assignment_id'), r.get('assessment'), r.get('id')))
                elif table_name in [
                    'OBE_cia1mark', 'OBE_cia2mark', 'OBE_formative1mark', 'OBE_formative2mark',
                    'OBE_modelexammark', 'OBE_projectmark', 'OBE_review1mark', 'OBE_review2mark', 
                    'OBE_ssa1mark', 'OBE_ssa2mark', 'OBE_labexammark', 'OBE_finalinternalmark'
                ]:
                    for r in row_list:
                        if 'assessment' in r:
                            cur.execute(f'''DELETE FROM public."{table_name}" WHERE teaching_assignment_id = %s AND student_id = %s AND assessment = %s AND id != %s''', (r.get('teaching_assignment_id'), r.get('student_id'), r.get('assessment'), r.get('id')))
                        else:
                            cur.execute(f'''DELETE FROM public."{table_name}" WHERE teaching_assignment_id = %s AND student_id = %s AND id != %s''', (r.get('teaching_assignment_id'), r.get('student_id'), r.get('id')))
                            
                columns = list(row_list[0].keys())
                values_list = []
                for row in row_list:
                    row_values = []
                    for col in columns:
                        val = row.get(col)
                        if isinstance(val, (dict, list)): val = json.dumps(val)
                        row_values.append(val)
                    values_list.append(tuple(row_values))
                    
                col_names = ', '.join([f'"{c}"' for c in columns])
                set_clauses = ', '.join([f'"{c}" = EXCLUDED."{c}"' for c in columns if c != 'id'])
                
                query = f"""
                    INSERT INTO public."{table_name}" ({col_names})
                    VALUES %s
                    ON CONFLICT (id) DO UPDATE SET {set_clauses};
                """ if set_clauses else f"""
                    INSERT INTO public."{table_name}" ({col_names})
                    VALUES %s
                    ON CONFLICT (id) DO NOTHING;
                """
                    
                from psycopg2.extras import execute_values
                execute_values(cur, query, values_list, page_size=1000)
                
            cur.execute("SET session_replication_role = 'origin';")
            print("Import completed successfully.")
            
    except Exception as e:
        print(f"Error during import: {e}")

if __name__ == '__main__':
    import_obe_data()
