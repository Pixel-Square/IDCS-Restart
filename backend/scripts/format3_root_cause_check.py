import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

import django

django.setup()

from django.db import connection


def run():
    with connection.cursor() as c:
        c.execute("SET statement_timeout TO 15000")

        c.execute(
            '''
SELECT sem, COUNT(*)
FROM reporting.vw_marks_project_lab
GROUP BY sem
ORDER BY COUNT(*) DESC, sem
            '''
        )
        sem_distribution = c.fetchall()

        c.execute(
            '''
WITH base AS (
  SELECT DISTINCT b.subject_id, UPPER(b.course_code) code, b.sem::int AS sem_from_subject
  FROM reporting.vw_pbi_student_subject_base b
), cur AS (
  SELECT UPPER(cd.course_code) code, MAX(s.number)::int AS sem_cur
  FROM curriculum_curriculumdepartment cd
  LEFT JOIN academics_semester s ON s.id = cd.semester_id
  GROUP BY UPPER(cd.course_code)
), ele AS (
  SELECT UPPER(es.course_code) code, MAX(s.number)::int AS sem_ele
  FROM curriculum_electivesubject es
  LEFT JOIN academics_semester s ON s.id = es.semester_id
  GROUP BY UPPER(es.course_code)
), proj_rows AS (
  SELECT DISTINCT UPPER("course code") code
  FROM reporting.vw_marks_project_lab
)
SELECT b.code,
       b.sem_from_subject,
       COALESCE(cur.sem_cur, ele.sem_ele) AS sem_expected,
       COALESCE(cur.sem_cur::text, '') AS sem_cur,
       COALESCE(ele.sem_ele::text, '') AS sem_ele,
       COUNT(*) AS cnt
FROM base b
LEFT JOIN cur ON cur.code = b.code
LEFT JOIN ele ON ele.code = b.code
JOIN proj_rows p ON p.code = b.code
WHERE COALESCE(cur.sem_cur, ele.sem_ele) IS NOT NULL
  AND b.sem_from_subject <> COALESCE(cur.sem_cur, ele.sem_ele)
GROUP BY b.code, b.sem_from_subject, sem_expected, sem_cur, sem_ele
ORDER BY cnt DESC, b.code
LIMIT 40
            '''
        )
        sem_mismatch = c.fetchall()

        c.execute(
            '''
WITH project_codes AS (
  SELECT DISTINCT UPPER(course_code) code
  FROM curriculum_electivesubject
  WHERE UPPER(TRIM(COALESCE(class_type, ''))) = 'PROJECT'
), in_base AS (
  SELECT DISTINCT UPPER(course_code) code,
         COALESCE(NULLIF(TRIM(course_type), ''), '<EMPTY>') AS course_type
  FROM reporting.vw_pbi_student_subject_base
), in_pl AS (
  SELECT DISTINCT UPPER("course code") code
  FROM reporting.vw_marks_project_lab
)
SELECT p.code,
       COALESCE(b.course_type, '<NO_BASE>') AS base_type,
       CASE WHEN pl.code IS NULL THEN 'NO' ELSE 'YES' END AS in_project_lab
FROM project_codes p
LEFT JOIN in_base b ON b.code = p.code
LEFT JOIN in_pl pl ON pl.code = p.code
ORDER BY in_project_lab, p.code
LIMIT 60
            '''
        )
        project_codes = c.fetchall()

        c.execute(
            '''
SELECT UPPER(course_code) AS code,
       MAX(NULLIF(TRIM(course_type), '')) AS base_type,
       MAX(sem::int) AS base_sem,
       COUNT(*) AS base_rows
FROM reporting.vw_pbi_student_subject_base
GROUP BY UPPER(course_code)
HAVING UPPER(course_code) IN (
    SELECT DISTINCT UPPER(course_code)
    FROM curriculum_electivesubject
    WHERE UPPER(TRIM(COALESCE(class_type, ''))) = 'PROJECT'
)
ORDER BY code
LIMIT 60
            '''
        )
        project_base_rows = c.fetchall()

    print('SEM_DISTRIBUTION', sem_distribution)
    print('SEM_MISMATCH_COUNT', len(sem_mismatch))
    for row in sem_mismatch[:80]:
        print('SEM_MISMATCH', row)

    print('PROJECT_ELECTIVE_CODES_COUNT', len(project_codes))
    yes_count = sum(1 for r in project_codes if r[2] == 'YES')
    no_count = sum(1 for r in project_codes if r[2] == 'NO')
    print('PROJECT_IN_FORMAT3_YES', yes_count)
    print('PROJECT_IN_FORMAT3_NO', no_count)
    for row in project_codes:
        print('PROJECT_STATUS', row)

    print('PROJECT_BASE_ROWS_COUNT', len(project_base_rows))
    for row in project_base_rows:
        print('PROJECT_BASE', row)


if __name__ == '__main__':
    run()
