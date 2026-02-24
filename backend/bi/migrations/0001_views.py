from django.db import migrations


VIEW_SQL = r"""
CREATE OR REPLACE VIEW bi_dim_student AS
SELECT
  sp.id AS student_id,
  sp.reg_no,
  sp.status,
  u.id AS user_id,
  COALESCE(u.username, '') AS username,
  COALESCE(u.first_name, '') AS first_name,
  COALESCE(u.last_name, '') AS last_name,
  COALESCE(u.email, '') AS email,
  sp.section_id,
  COALESCE(sec.name, '') AS section_name,
  b.id AS batch_id,
  COALESCE(b.name, '') AS batch_name,
  c.id AS course_id,
  COALESCE(c.name, '') AS course_name,
  p.id AS program_id,
  COALESCE(p.name, '') AS program_name,
  d.id AS dept_id,
  COALESCE(d.code, '') AS dept_code,
  COALESCE(d.name, '') AS dept_name,
  sp.mobile_number_verified_at
FROM academics_studentprofile sp
JOIN accounts_user u ON u.id = sp.user_id
LEFT JOIN academics_section sec ON sec.id = sp.section_id
LEFT JOIN academics_batch b ON b.id = sec.batch_id
LEFT JOIN academics_course c ON c.id = b.course_id
LEFT JOIN academics_program p ON p.id = c.program_id
LEFT JOIN academics_department d ON d.id = c.department_id;

CREATE OR REPLACE VIEW bi_dim_subject AS
SELECT
  s.id AS subject_id,
  s.code AS subject_code,
  s.name AS subject_name,
  s.semester_id,
  sem.number AS semester_no,
  c.id AS course_id,
  COALESCE(c.name, '') AS course_name,
  p.id AS program_id,
  COALESCE(p.name, '') AS program_name,
  d.id AS dept_id,
  COALESCE(d.code, '') AS dept_code,
  COALESCE(d.name, '') AS dept_name
FROM academics_subject s
LEFT JOIN academics_semester sem ON sem.id = s.semester_id
LEFT JOIN academics_course c ON c.id = s.course_id
LEFT JOIN academics_program p ON p.id = c.program_id
LEFT JOIN academics_department d ON d.id = c.department_id;

CREATE OR REPLACE VIEW bi_dim_teaching_assignment AS
SELECT
  ta.id AS teaching_assignment_id,
  ta.is_active,
  ta.academic_year_id,
  COALESCE(ay.name, '') AS academic_year,
  COALESCE(ay.parity, '') AS academic_year_parity,
  ta.section_id,
  COALESCE(sec.name, '') AS section_name,
  ta.subject_id,
  COALESCE(subj.code, '') AS subject_code,
  COALESCE(subj.name, '') AS subject_name,
  ta.staff_id AS staff_profile_id,
  COALESCE(st.staff_id, '') AS staff_id,
  st.user_id AS staff_user_id,
  COALESCE(u.username, '') AS staff_username,
  COALESCE(u.first_name, '') AS staff_first_name,
  COALESCE(u.last_name, '') AS staff_last_name,
  ta.enabled_assessments
FROM academics_teachingassignment ta
LEFT JOIN academics_academicyear ay ON ay.id = ta.academic_year_id
LEFT JOIN academics_section sec ON sec.id = ta.section_id
LEFT JOIN academics_subject subj ON subj.id = ta.subject_id
LEFT JOIN academics_staffprofile st ON st.id = ta.staff_id
LEFT JOIN accounts_user u ON u.id = st.user_id;

CREATE OR REPLACE VIEW bi_fact_marks AS
WITH base AS (
  SELECT
    'OBE_cia1mark'::text AS source_table,
    m.id AS source_id,
    'cia1'::text AS assessment_key,
    'mark'::text AS component_key,
    m.subject_id,
    m.student_id,
    m.mark::numeric AS score,
    m.created_at,
    m.updated_at
  FROM "OBE_cia1mark" m

  UNION ALL
  SELECT
    'OBE_cia2mark', m.id, 'cia2', 'mark', m.subject_id, m.student_id, m.mark::numeric, m.created_at, m.updated_at
  FROM "OBE_cia2mark" m

  UNION ALL
  SELECT
    'OBE_ssa1mark', m.id, 'ssa1', 'mark', m.subject_id, m.student_id, m.mark::numeric, m.created_at, m.updated_at
  FROM "OBE_ssa1mark" m

  UNION ALL
  SELECT
    'OBE_ssa2mark', m.id, 'ssa2', 'mark', m.subject_id, m.student_id, m.mark::numeric, m.created_at, m.updated_at
  FROM "OBE_ssa2mark" m

  UNION ALL
  SELECT
    'OBE_review1mark', m.id, 'review1', 'mark', m.subject_id, m.student_id, m.mark::numeric, m.created_at, m.updated_at
  FROM "OBE_review1mark" m

  UNION ALL
  SELECT
    'OBE_review2mark', m.id, 'review2', 'mark', m.subject_id, m.student_id, m.mark::numeric, m.created_at, m.updated_at
  FROM "OBE_review2mark" m

  UNION ALL
  SELECT
    'OBE_formative1mark',
    m.id,
    'formative1',
    comp.component_key,
    m.subject_id,
    m.student_id,
    comp.score::numeric,
    m.created_at,
    m.updated_at
  FROM "OBE_formative1mark" m
  CROSS JOIN LATERAL (
    VALUES
      ('skill1', m.skill1),
      ('skill2', m.skill2),
      ('att1', m.att1),
      ('att2', m.att2),
      ('total', m.total)
  ) AS comp(component_key, score)

  UNION ALL
  SELECT
    'OBE_formative2mark',
    m.id,
    'formative2',
    comp.component_key,
    m.subject_id,
    m.student_id,
    comp.score::numeric,
    m.created_at,
    m.updated_at
  FROM "OBE_formative2mark" m
  CROSS JOIN LATERAL (
    VALUES
      ('skill1', m.skill1),
      ('skill2', m.skill2),
      ('att1', m.att1),
      ('att2', m.att2),
      ('total', m.total)
  ) AS comp(component_key, score)
)
SELECT
  (base.source_table || ':' || base.source_id::text || ':' || base.component_key) AS fact_key,
  base.assessment_key,
  base.component_key,
  base.source_table,
  base.source_id,
  base.subject_id,
  COALESCE(subj.code, '') AS subject_code,
  COALESCE(subj.name, '') AS subject_name,
  base.student_id,
  COALESCE(sp.reg_no, '') AS reg_no,
  base.score,
  base.created_at,
  base.updated_at
FROM base
LEFT JOIN academics_subject subj ON subj.id = base.subject_id
LEFT JOIN academics_studentprofile sp ON sp.id = base.student_id;
"""

DROP_SQL = r"""
DROP VIEW IF EXISTS bi_fact_marks;
DROP VIEW IF EXISTS bi_dim_teaching_assignment;
DROP VIEW IF EXISTS bi_dim_subject;
DROP VIEW IF EXISTS bi_dim_student;
"""


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.RunSQL(VIEW_SQL, reverse_sql=DROP_SQL),
    ]
