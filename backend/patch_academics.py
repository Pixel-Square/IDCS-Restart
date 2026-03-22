import re, decimal

file_path = 'academics/views.py'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Insert the DB query before out_courses = []
query_code = """
        bi_data_by_subj = {}
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM bi_obe_student_subject_wide WHERE student_id = %s", [sp.id])
                cols = [col[0] for col in cursor.description]
                for row in cursor.fetchall():
                    d = dict(zip(cols, row))
                    sid = d.get('subject_id')
                    if sid:
                        bi_data_by_subj[sid] = d
        except Exception:
            pass

        out_courses = []
"""
if "bi_data_by_subj" not in text:
    text = text.replace("        out_courses = []", query_code, 1)

# Now inject into 'marks' dict
def replace_func(m):
    return """                        'has_cqi': has_cqi,
                        **({'cos': cos} if cos is not None else {}),
                        'bi': {k: (float(v) if isinstance(v, decimal.Decimal) else v) for k, v in bi_data_by_subj.get(getattr(subj, 'id', None), {}).items() if v is not None} if getattr(subj, 'id', None) else {},
                    },"""

text = re.sub(r"                        'has_cqi': has_cqi,\n\s+\*\*\(\{'cos': cos\} if cos is not None else \{\}\),\n\s+\},", replace_func, text)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)
print("Patched academics/views.py")
