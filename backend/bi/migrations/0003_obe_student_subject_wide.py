from django.db import migrations


VIEW_SQL = r"""
CREATE OR REPLACE VIEW bi_obe_student_subject_wide AS
WITH marks_pivot AS (
  SELECT
    student_id,
    subject_id,
    MAX(score) FILTER (WHERE assessment_key = 'ssa1' AND component_key = 'mark') AS ssa1_total,
    MAX(score) FILTER (WHERE assessment_key = 'ssa2' AND component_key = 'mark') AS ssa2_total,
    MAX(score) FILTER (WHERE assessment_key = 'review1' AND component_key = 'mark') AS review1_total,
    MAX(score) FILTER (WHERE assessment_key = 'review2' AND component_key = 'mark') AS review2_total,
    MAX(score) FILTER (WHERE assessment_key = 'cia1' AND component_key = 'mark') AS cia1_total,
    MAX(score) FILTER (WHERE assessment_key = 'cia2' AND component_key = 'mark') AS cia2_total,
    MAX(score) FILTER (WHERE assessment_key = 'formative1' AND component_key = 'total') AS formative1_total,
    MAX(score) FILTER (WHERE assessment_key = 'formative2' AND component_key = 'total') AS formative2_total
  FROM bi_fact_marks
  GROUP BY student_id, subject_id
),
cia_co_pivot AS (
  SELECT
    student_id,
    subject_id,
    MAX(score) FILTER (WHERE assessment_key = 'cia1' AND co_no = 1) AS cia1_co1,
    MAX(max_score) FILTER (WHERE assessment_key = 'cia1' AND co_no = 1) AS cia1_co1_max,
    MAX(score) FILTER (WHERE assessment_key = 'cia1' AND co_no = 2) AS cia1_co2,
    MAX(max_score) FILTER (WHERE assessment_key = 'cia1' AND co_no = 2) AS cia1_co2_max,
    MAX(score) FILTER (WHERE assessment_key = 'cia2' AND co_no = 3) AS cia2_co3,
    MAX(max_score) FILTER (WHERE assessment_key = 'cia2' AND co_no = 3) AS cia2_co3_max,
    MAX(score) FILTER (WHERE assessment_key = 'cia2' AND co_no = 4) AS cia2_co4,
    MAX(max_score) FILTER (WHERE assessment_key = 'cia2' AND co_no = 4) AS cia2_co4_max
  FROM bi_fact_cia_co
  GROUP BY student_id, subject_id
)
SELECT
  (mp.student_id::text || ':' || mp.subject_id::text) AS row_key,

  mp.student_id,
  ds.reg_no,
  NULLIF(TRIM(ds.first_name || ' ' || ds.last_name), '') AS student_name,
  ds.status AS student_status,

  ds.dept_id,
  ds.dept_code,
  ds.dept_name,
  ds.program_id,
  ds.program_name,
  ds.course_id,
  ds.course_name,
  ds.batch_id,
  ds.batch_name,
  ds.section_id,
  ds.section_name,

  sec.semester_id AS section_semester_id,
  sem.number AS section_semester_no,

  mp.subject_id,
  subj.code AS subject_code,
  subj.name AS subject_name,

  ta.teaching_assignment_id,
  ta.academic_year_id,
  ta.academic_year,

  mp.ssa1_total,
  mp.ssa2_total,
  mp.review1_total,
  mp.review2_total,
  mp.formative1_total,
  mp.formative2_total,
  mp.cia1_total,
  mp.cia2_total,

  ccp.cia1_co1,
  ccp.cia1_co1_max,
  ccp.cia1_co2,
  ccp.cia1_co2_max,
  ccp.cia2_co3,
  ccp.cia2_co3_max,
  ccp.cia2_co4,
  ccp.cia2_co4_max
FROM marks_pivot mp
JOIN bi_dim_student ds ON ds.student_id = mp.student_id
JOIN academics_subject subj ON subj.id = mp.subject_id
LEFT JOIN academics_section sec ON sec.id = ds.section_id
LEFT JOIN academics_semester sem ON sem.id = sec.semester_id
LEFT JOIN cia_co_pivot ccp ON ccp.student_id = mp.student_id AND ccp.subject_id = mp.subject_id
LEFT JOIN LATERAL (
  SELECT
    ta.id AS teaching_assignment_id,
    ta.academic_year_id,
    COALESCE(ay.name, '') AS academic_year
  FROM academics_teachingassignment ta
  LEFT JOIN academics_academicyear ay ON ay.id = ta.academic_year_id
  WHERE ta.subject_id = mp.subject_id
    AND ta.section_id = ds.section_id
    AND ta.is_active = TRUE
  ORDER BY ta.academic_year_id DESC NULLS LAST, ta.id DESC
  LIMIT 1
) ta ON TRUE;
"""


DROP_SQL = r"""
DROP VIEW IF EXISTS bi_obe_student_subject_wide;
"""


class Migration(migrations.Migration):
    dependencies = [
        ('bi', '0002_obe_cia_co_views'),
    ]

    operations = [
        migrations.RunSQL(VIEW_SQL, reverse_sql=DROP_SQL),
    ]
