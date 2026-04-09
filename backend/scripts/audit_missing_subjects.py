import os
import csv
import sys
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

import django

django.setup()

from django.db import connection
from reporting.services import query_reporting_view


def norm(v):
    return str(v or '').strip()


def up(v):
    return norm(v).upper()


loaded_codes = set()
for fmt in ('theory', 'tcpr-tcpl', 'project-lab'):
    result = query_reporting_view(format_key=fmt, filters={}, page=1, page_size=300000)
    for row in result.rows:
        code = up(row.get('course code'))
        if code:
            loaded_codes.add(code)

master_subjects = {}
with connection.cursor() as c:
    c.execute(
        '''
        SELECT UPPER(course_code) AS code,
               MAX(NULLIF(TRIM(course_name), '')) AS course_name,
               MAX(NULLIF(TRIM(class_type), '')) AS class_type,
               MAX(NULLIF(TRIM(category), '')) AS category,
               'curriculum_curriculumdepartment' AS source
        FROM curriculum_curriculumdepartment
        WHERE NULLIF(TRIM(course_code), '') IS NOT NULL
        GROUP BY UPPER(course_code)
        UNION ALL
        SELECT UPPER(course_code) AS code,
               MAX(NULLIF(TRIM(course_name), '')) AS course_name,
               MAX(NULLIF(TRIM(class_type), '')) AS class_type,
               MAX(NULLIF(TRIM(category), '')) AS category,
               'curriculum_electivesubject' AS source
        FROM curriculum_electivesubject
        WHERE NULLIF(TRIM(course_code), '') IS NOT NULL
        GROUP BY UPPER(course_code)
        '''
    )
    for code, name, ctype, cat, source in c.fetchall():
        code = up(code)
        if not code:
            continue
        rec = master_subjects.setdefault(
            code,
            {
                'course_name': norm(name),
                'class_type': norm(ctype),
                'category': norm(cat),
                'sources': set(),
            },
        )
        if not rec['course_name'] and norm(name):
            rec['course_name'] = norm(name)
        if not rec['class_type'] and norm(ctype):
            rec['class_type'] = norm(ctype)
        if not rec['category'] and norm(cat):
            rec['category'] = norm(cat)
        rec['sources'].add(source)

base_codes = set()
base_meta = {}
with connection.cursor() as c:
    c.execute(
        '''
        SELECT UPPER(course_code) AS code,
               MAX(NULLIF(TRIM(course_name), '')) AS course_name,
             MAX(NULLIF(TRIM(course_type), '')) AS class_type,
               MAX(NULLIF(TRIM(course_category), '')) AS category
        FROM reporting.vw_pbi_student_subject_base
        WHERE NULLIF(TRIM(course_code), '') IS NOT NULL
        GROUP BY UPPER(course_code)
        '''
    )
    for code, name, ctype, cat in c.fetchall():
        code = up(code)
        base_codes.add(code)
        base_meta[code] = {
            'course_name': norm(name),
            'class_type': norm(ctype),
            'category': norm(cat),
        }

missing_master = sorted(code for code in master_subjects if code not in loaded_codes)
missing_base = sorted(code for code in base_codes if code not in loaded_codes)

by_type_master = defaultdict(int)
for code in missing_master:
    by_type_master[up(master_subjects[code].get('class_type')) or '<EMPTY>'] += 1

by_type_base = defaultdict(int)
for code in missing_base:
    by_type_base[up(base_meta[code].get('class_type')) or '<EMPTY>'] += 1

print('LOADED_SUBJECT_CODES', len(loaded_codes))
print('MASTER_SUBJECT_CODES', len(master_subjects))
print('BASE_SUBJECT_CODES', len(base_codes))
print('MISSING_FROM_API_vs_MASTER', len(missing_master))
print('MISSING_FROM_API_vs_BASE', len(missing_base))
print('MISSING_TYPES_vs_MASTER', dict(sorted(by_type_master.items(), key=lambda kv: (-kv[1], kv[0]))))
print('MISSING_TYPES_vs_BASE', dict(sorted(by_type_base.items(), key=lambda kv: (-kv[1], kv[0]))))

print('\nSAMPLE_MISSING_vs_BASE (up to 30)')
for code in missing_base[:30]:
    m = base_meta[code]
    print(code, '|', m.get('class_type') or '<EMPTY>', '|', m.get('course_name') or '<EMPTY>', '|', m.get('category') or '<EMPTY>')

print('\nSAMPLE_MISSING_vs_MASTER (up to 30)')
for code in missing_master[:30]:
    m = master_subjects[code]
    print(code, '|', m.get('class_type') or '<EMPTY>', '|', m.get('course_name') or '<EMPTY>', '|', m.get('category') or '<EMPTY>')

out1 = '/home/iqac/IDCS-Restart/backend/missing_subjects_vs_master.csv'
out2 = '/home/iqac/IDCS-Restart/backend/missing_subjects_vs_base.csv'

with open(out1, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['course_code', 'class_type', 'course_name', 'category', 'sources'])
    for code in missing_master:
        m = master_subjects[code]
        w.writerow([
            code,
            m.get('class_type', ''),
            m.get('course_name', ''),
            m.get('category', ''),
            ','.join(sorted(m.get('sources', set()))),
        ])

with open(out2, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['course_code', 'class_type', 'course_name', 'category'])
    for code in missing_base:
        m = base_meta[code]
        w.writerow([code, m.get('class_type', ''), m.get('course_name', ''), m.get('category', '')])

print('\nCSV_WRITTEN', out1)
print('CSV_WRITTEN', out2)
