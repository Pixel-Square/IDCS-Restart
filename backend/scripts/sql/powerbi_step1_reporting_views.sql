-- Step 1 deliverable: BI-ready reporting views for Power BI users.
-- Database: PostgreSQL
-- Notes:
-- 1) These views preserve the exact requested column order and labels.
-- 2) Some ERP data points are not persisted in separate tables (for example, ESE and explicit before-CQI snapshots).
--    Those are derived/fallback values here and should be refined if a dedicated source table is introduced.

BEGIN;

CREATE SCHEMA IF NOT EXISTS reporting;

CREATE OR REPLACE FUNCTION reporting.to_numeric_or_zero(txt text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN txt ~ '^[-+]?[0-9]+(\.[0-9]+)?$' THEN txt::numeric
    ELSE 0::numeric
  END;
$$;

CREATE OR REPLACE FUNCTION reporting.co_key_to_int(txt text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(txt, ''), '[^0-9]', '', 'g'), '')::integer;
$$;

DROP VIEW IF EXISTS reporting.vw_pbi_student_subject_base CASCADE;
CREATE VIEW reporting.vw_pbi_student_subject_base AS
WITH subject_student_union AS (
  SELECT subject_id, student_id FROM "OBE_ssa1mark"
  UNION
  SELECT subject_id, student_id FROM "OBE_ssa2mark"
  UNION
  SELECT subject_id, student_id FROM "OBE_cia1mark"
  UNION
  SELECT subject_id, student_id FROM "OBE_cia2mark"
  UNION
  SELECT subject_id, student_id FROM "OBE_formative1mark"
  UNION
  SELECT subject_id, student_id FROM "OBE_formative2mark"
  UNION
  SELECT subject_id, student_id FROM "OBE_review1mark"
  UNION
  SELECT subject_id, student_id FROM "OBE_review2mark"
)
SELECT
  su.subject_id,
  su.student_id,
  COALESCE(NULLIF(sp.batch, ''), '') AS year,
  sem.number::text AS sem,
  COALESCE(
    NULLIF(dept_batch_course.short_name, ''),
    NULLIF(dept_home.short_name, ''),
    NULLIF(dept_sec.short_name, ''),
    NULLIF(dept_batch.short_name, ''),
    NULLIF(dept_batch_course.code, ''),
    NULLIF(dept_home.code, ''),
    NULLIF(dept_sec.code, ''),
    NULLIF(dept_batch.code, ''),
    dept_batch_course.name,
    dept_home.name,
    dept_sec.name,
    dept_batch.name,
    NULLIF(dept.short_name, ''),
    NULLIF(dept.code, ''),
    dept.name,
    ''
  ) AS dept,
  COALESCE(NULLIF(sec.name, ''), '') AS sec,
  RIGHT(regexp_replace(COALESCE(sp.reg_no, ''), '\\D', '', 'g'), 12) AS reg_no_last_12_digit,
  COALESCE(
    NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
    NULLIF(TRIM(COALESCE(u.username, '')), ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    NULLIF(RIGHT(regexp_replace(COALESCE(sp.reg_no, ''), '\\D', '', 'g'), 12), ''),
    ''
  ) AS name,
  COALESCE(cur_primary.class_type, cur_fallback.class_type, '') AS course_type,
  COALESCE(subj.code, '') AS course_code,
  COALESCE(cur_primary.category, cur_fallback.category, '') AS course_category,
  COALESCE(subj.name, '') AS course_name
FROM subject_student_union su
JOIN academics_studentprofile sp ON sp.id = su.student_id
LEFT JOIN accounts_user u ON u.id = sp.user_id
JOIN academics_subject subj ON subj.id = su.subject_id
LEFT JOIN academics_semester sem ON sem.id = subj.semester_id
LEFT JOIN academics_course crs ON crs.id = subj.course_id
LEFT JOIN academics_department dept ON dept.id = crs.department_id
LEFT JOIN academics_section sec ON sec.id = sp.section_id
LEFT JOIN academics_department dept_sec ON dept_sec.id = sec.managing_department_id
LEFT JOIN academics_department dept_home ON dept_home.id = sp.home_department_id
LEFT JOIN academics_batch bch ON bch.id = sec.batch_id
LEFT JOIN academics_course bch_course ON bch_course.id = bch.course_id
LEFT JOIN academics_department dept_batch_course ON dept_batch_course.id = bch_course.department_id
LEFT JOIN academics_department dept_batch ON dept_batch.id = bch.department_id
LEFT JOIN LATERAL (
  SELECT cd.class_type, cd.category
  FROM curriculum_curriculumdepartment cd
  WHERE cd.department_id = dept.id
    AND cd.semester_id = subj.semester_id
    AND UPPER(TRIM(COALESCE(cd.course_code, ''))) = UPPER(TRIM(COALESCE(subj.code, '')))
  ORDER BY cd.id DESC
  LIMIT 1
) cur_primary ON TRUE
LEFT JOIN LATERAL (
  SELECT cd.department_id, cd.class_type, cd.category
  FROM curriculum_curriculumdepartment cd
  WHERE cd.semester_id = subj.semester_id
    AND UPPER(TRIM(COALESCE(cd.course_code, ''))) = UPPER(TRIM(COALESCE(subj.code, '')))
  ORDER BY cd.id DESC
  LIMIT 1
) cur_fallback ON TRUE;

DROP VIEW IF EXISTS reporting.vw_pbi_mark_totals CASCADE;
CREATE VIEW reporting.vw_pbi_mark_totals AS
SELECT
  x.subject_id,
  x.student_id,
  MAX(x.ssa1) AS ssa1,
  MAX(x.ssa2) AS ssa2,
  MAX(x.formative1_total) AS formative1_total,
  MAX(x.formative2_total) AS formative2_total,
  MAX(x.review1) AS review1,
  MAX(x.review2) AS review2,
  MAX(x.cia1_total) AS cia1_total,
  MAX(x.cia2_total) AS cia2_total
FROM (
  SELECT subject_id, student_id, mark::numeric AS ssa1, NULL::numeric AS ssa2,
         NULL::numeric AS formative1_total, NULL::numeric AS formative2_total,
         NULL::numeric AS review1, NULL::numeric AS review2,
         NULL::numeric AS cia1_total, NULL::numeric AS cia2_total
  FROM "OBE_ssa1mark"
  UNION ALL
  SELECT subject_id, student_id, NULL, mark::numeric,
         NULL, NULL, NULL, NULL, NULL, NULL
  FROM "OBE_ssa2mark"
  UNION ALL
  SELECT subject_id, student_id, NULL, NULL,
         total::numeric, NULL, NULL, NULL, NULL, NULL
  FROM "OBE_formative1mark"
  UNION ALL
  SELECT subject_id, student_id, NULL, NULL,
         NULL, total::numeric, NULL, NULL, NULL, NULL
  FROM "OBE_formative2mark"
  UNION ALL
  SELECT subject_id, student_id, NULL, NULL,
         NULL, NULL, mark::numeric, NULL, NULL, NULL
  FROM "OBE_review1mark"
  UNION ALL
  SELECT subject_id, student_id, NULL, NULL,
         NULL, NULL, NULL, mark::numeric, NULL, NULL
  FROM "OBE_review2mark"
  UNION ALL
  SELECT subject_id, student_id, NULL, NULL,
         NULL, NULL, NULL, NULL, mark::numeric, NULL
  FROM "OBE_cia1mark"
  UNION ALL
  SELECT subject_id, student_id, NULL, NULL,
         NULL, NULL, NULL, NULL, NULL, mark::numeric
  FROM "OBE_cia2mark"
) x
GROUP BY x.subject_id, x.student_id;

DROP VIEW IF EXISTS reporting.vw_pbi_cia1_co_scores CASCADE;
CREATE VIEW reporting.vw_pbi_cia1_co_scores AS
WITH qmap AS (
  SELECT
    s.id AS sheet_id,
    s.subject_id,
    LOWER(COALESCE(q.value->>'key', '')) AS q_key,
    reporting.co_key_to_int(
      CASE
        WHEN jsonb_typeof(q.value->'co') = 'array' THEN q.value->'co'->>0
        ELSE q.value->>'co'
      END
    ) AS co_num
  FROM "OBE_cia1publishedsheet" s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.data->'questions', '[]'::jsonb)) q(value)
), rows AS (
  SELECT
    s.id AS sheet_id,
    s.subject_id,
    e.key AS student_key,
    e.value AS row_data
  FROM "OBE_cia1publishedsheet" s
  CROSS JOIN LATERAL jsonb_each(COALESCE(s.data->'rowsByStudentId', '{}'::jsonb)) e
), exploded AS (
  SELECT
    r.subject_id,
    reporting.co_key_to_int(r.student_key) AS student_id,
    q.co_num,
    reporting.to_numeric_or_zero(r.row_data->'q'->>q.q_key) AS mark_value
  FROM rows r
  JOIN qmap q ON q.sheet_id = r.sheet_id AND q.q_key <> ''
)
SELECT
  subject_id,
  student_id,
  SUM(CASE WHEN co_num = 1 THEN mark_value ELSE 0 END) AS co1,
  SUM(CASE WHEN co_num = 2 THEN mark_value ELSE 0 END) AS co2,
  SUM(CASE WHEN co_num = 3 THEN mark_value ELSE 0 END) AS co3,
  SUM(CASE WHEN co_num = 4 THEN mark_value ELSE 0 END) AS co4,
  SUM(CASE WHEN co_num = 5 THEN mark_value ELSE 0 END) AS co5,
  SUM(mark_value) AS total
FROM exploded
WHERE student_id IS NOT NULL
GROUP BY subject_id, student_id;

DROP VIEW IF EXISTS reporting.vw_pbi_cia2_co_scores CASCADE;
CREATE VIEW reporting.vw_pbi_cia2_co_scores AS
WITH qmap AS (
  SELECT
    s.id AS sheet_id,
    s.subject_id,
    LOWER(COALESCE(q.value->>'key', '')) AS q_key,
    reporting.co_key_to_int(
      CASE
        WHEN jsonb_typeof(q.value->'co') = 'array' THEN q.value->'co'->>0
        ELSE q.value->>'co'
      END
    ) AS co_num
  FROM "OBE_cia2publishedsheet" s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.data->'questions', '[]'::jsonb)) q(value)
), rows AS (
  SELECT
    s.id AS sheet_id,
    s.subject_id,
    e.key AS student_key,
    e.value AS row_data
  FROM "OBE_cia2publishedsheet" s
  CROSS JOIN LATERAL jsonb_each(COALESCE(s.data->'rowsByStudentId', '{}'::jsonb)) e
), exploded AS (
  SELECT
    r.subject_id,
    reporting.co_key_to_int(r.student_key) AS student_id,
    q.co_num,
    reporting.to_numeric_or_zero(r.row_data->'q'->>q.q_key) AS mark_value
  FROM rows r
  JOIN qmap q ON q.sheet_id = r.sheet_id AND q.q_key <> ''
)
SELECT
  subject_id,
  student_id,
  SUM(CASE WHEN co_num = 1 THEN mark_value ELSE 0 END) AS co1,
  SUM(CASE WHEN co_num = 2 THEN mark_value ELSE 0 END) AS co2,
  SUM(CASE WHEN co_num = 3 THEN mark_value ELSE 0 END) AS co3,
  SUM(CASE WHEN co_num = 4 THEN mark_value ELSE 0 END) AS co4,
  SUM(CASE WHEN co_num = 5 THEN mark_value ELSE 0 END) AS co5,
  SUM(mark_value) AS total
FROM exploded
WHERE student_id IS NOT NULL
GROUP BY subject_id, student_id;

DROP VIEW IF EXISTS reporting.vw_pbi_model_co_scores CASCADE;
CREATE VIEW reporting.vw_pbi_model_co_scores AS
WITH qmap AS (
  SELECT
    s.id AS sheet_id,
    s.subject_id,
    LOWER(COALESCE(q.value->>'key', '')) AS q_key,
    reporting.co_key_to_int(
      CASE
        WHEN jsonb_typeof(q.value->'co') = 'array' THEN q.value->'co'->>0
        ELSE q.value->>'co'
      END
    ) AS co_num
  FROM "OBE_modelpublishedsheet" s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.data->'questions', '[]'::jsonb)) q(value)
), rows AS (
  SELECT
    s.id AS sheet_id,
    s.subject_id,
    e.key AS student_key,
    e.value AS row_data
  FROM "OBE_modelpublishedsheet" s
  CROSS JOIN LATERAL jsonb_each(COALESCE(s.data->'rowsByStudentId', '{}'::jsonb)) e
), exploded AS (
  SELECT
    r.subject_id,
    reporting.co_key_to_int(r.student_key) AS student_id,
    q.co_num,
    reporting.to_numeric_or_zero(r.row_data->'q'->>q.q_key) AS mark_value
  FROM rows r
  JOIN qmap q ON q.sheet_id = r.sheet_id AND q.q_key <> ''
)
SELECT
  subject_id,
  student_id,
  SUM(CASE WHEN co_num = 1 THEN mark_value ELSE 0 END) AS co1,
  SUM(CASE WHEN co_num = 2 THEN mark_value ELSE 0 END) AS co2,
  SUM(CASE WHEN co_num = 3 THEN mark_value ELSE 0 END) AS co3,
  SUM(CASE WHEN co_num = 4 THEN mark_value ELSE 0 END) AS co4,
  SUM(CASE WHEN co_num = 5 THEN mark_value ELSE 0 END) AS co5,
  SUM(mark_value) AS total
FROM exploded
WHERE student_id IS NOT NULL
GROUP BY subject_id, student_id;

DROP VIEW IF EXISTS reporting.vw_pbi_lab_assessment_co_scores CASCADE;
CREATE VIEW reporting.vw_pbi_lab_assessment_co_scores AS
WITH rows AS (
  SELECT
    l.id AS sheet_id,
    l.subject_id,
    LOWER(COALESCE(l.assessment, '')) AS assessment,
    reporting.co_key_to_int(e.key) AS student_id,
    e.value AS row_data,
    l.data AS sheet_data
  FROM "OBE_labpublishedsheet" l
  CROSS JOIN LATERAL jsonb_each(
    COALESCE(
      l.data->'rowsByStudentId',
      l.data->'sheet'->'rowsByStudentId',
      CASE
        WHEN jsonb_typeof(l.data->'sheet') = 'object' THEN l.data->'sheet'
        ELSE '{}'::jsonb
      END,
      '{}'::jsonb
    )
  ) e
), byco_marks AS (
  SELECT
    r.subject_id,
    r.assessment,
    r.student_id,
    reporting.co_key_to_int(mb.key) AS co_num,
    SUM(reporting.to_numeric_or_zero(val_txt.value)) AS mark_value
  FROM rows r
  CROSS JOIN LATERAL jsonb_each(COALESCE(r.row_data->'marksByCo', '{}'::jsonb)) mb
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(mb.value) = 'array' THEN mb.value
      ELSE '[]'::jsonb
    END
  ) val_txt(value)
  WHERE r.student_id IS NOT NULL
  GROUP BY r.subject_id, r.assessment, r.student_id, reporting.co_key_to_int(mb.key)
), fallback_marks_a AS (
  SELECT
    r.subject_id,
    r.assessment,
    r.student_id,
    reporting.co_key_to_int(r.sheet_data->>'coANum') AS co_num,
    SUM(reporting.to_numeric_or_zero(val_txt.value)) AS mark_value
  FROM rows r
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(r.row_data->'marksA') = 'array' THEN r.row_data->'marksA'
      ELSE '[]'::jsonb
    END
  ) val_txt(value)
  WHERE r.student_id IS NOT NULL
  GROUP BY r.subject_id, r.assessment, r.student_id, reporting.co_key_to_int(r.sheet_data->>'coANum')
), fallback_marks_b AS (
  SELECT
    r.subject_id,
    r.assessment,
    r.student_id,
    reporting.co_key_to_int(r.sheet_data->>'coBNum') AS co_num,
    SUM(reporting.to_numeric_or_zero(val_txt.value)) AS mark_value
  FROM rows r
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(r.row_data->'marksB') = 'array' THEN r.row_data->'marksB'
      ELSE '[]'::jsonb
    END
  ) val_txt(value)
  WHERE r.student_id IS NOT NULL
  GROUP BY r.subject_id, r.assessment, r.student_id, reporting.co_key_to_int(r.sheet_data->>'coBNum')
), all_marks AS (
  SELECT * FROM byco_marks
  UNION ALL
  SELECT * FROM fallback_marks_a
  UNION ALL
  SELECT * FROM fallback_marks_b
)
SELECT
  subject_id,
  assessment,
  student_id,
  SUM(CASE WHEN co_num = 1 THEN mark_value ELSE 0 END) AS co1,
  SUM(CASE WHEN co_num = 2 THEN mark_value ELSE 0 END) AS co2,
  SUM(CASE WHEN co_num = 3 THEN mark_value ELSE 0 END) AS co3,
  SUM(CASE WHEN co_num = 4 THEN mark_value ELSE 0 END) AS co4,
  SUM(CASE WHEN co_num = 5 THEN mark_value ELSE 0 END) AS co5,
  SUM(mark_value) AS total
FROM all_marks
WHERE co_num IS NOT NULL
GROUP BY subject_id, assessment, student_id;

DROP VIEW IF EXISTS reporting.vw_pbi_cqi_published_scores CASCADE;
CREATE VIEW reporting.vw_pbi_cqi_published_scores AS
WITH entries AS (
  SELECT
    c.subject_id,
    reporting.co_key_to_int(e.key) AS student_id,
    e.value AS payload
  FROM obe_cqi_published c
  CROSS JOIN LATERAL jsonb_each(COALESCE(c.entries, '{}'::jsonb)) e
)
SELECT
  subject_id,
  student_id,
  MAX(reporting.to_numeric_or_zero(payload->>'co1')) AS co1,
  MAX(reporting.to_numeric_or_zero(payload->>'co2')) AS co2,
  MAX(reporting.to_numeric_or_zero(payload->>'co3')) AS co3,
  MAX(reporting.to_numeric_or_zero(payload->>'co4')) AS co4,
  MAX(reporting.to_numeric_or_zero(payload->>'co5')) AS co5,
  MAX(reporting.to_numeric_or_zero(payload->>'co1') + reporting.to_numeric_or_zero(payload->>'co2') + reporting.to_numeric_or_zero(payload->>'co3') + reporting.to_numeric_or_zero(payload->>'co4') + reporting.to_numeric_or_zero(payload->>'co5')) AS total
FROM entries
WHERE student_id IS NOT NULL
GROUP BY subject_id, student_id;

DROP VIEW IF EXISTS reporting.vw_marks_theory CASCADE;
CREATE VIEW reporting.vw_marks_theory AS
SELECT
  b.year AS "year",
  b.sem AS "sem",
  b.dept AS "dept",
  b.sec AS "sec",
  b.reg_no_last_12_digit AS "reg no (last 12 digit)",
  b.name AS "name",
  b.course_type AS "course type",
  b.course_code AS "course code",
  b.course_category AS "course category",
  b.course_name AS "course name",

  ROUND(COALESCE(t.ssa1, 0) / 2.0, 2) AS "c1-ssa1-co1",
  ROUND(COALESCE(t.ssa1, 0) / 2.0, 2) AS "c1-ssa1-co2",
  ROUND(COALESCE(t.ssa1, 0), 2) AS "c1-ssa1",

  ROUND(COALESCE(t.formative1_total, 0) / 2.0, 2) AS "c1-fa1-co1",
  ROUND(COALESCE(t.formative1_total, 0) / 2.0, 2) AS "c1-fa1-co2",
  ROUND(COALESCE(t.formative1_total, 0), 2) AS "c1-fa",

  ROUND(COALESCE(c1.co1, 0), 2) AS "c1-cia1-co1",
  ROUND(COALESCE(c1.co2, 0), 2) AS "c1-cia1-co2",
  ROUND(COALESCE(c1.total, COALESCE(t.cia1_total, 0)), 2) AS "c1-cia1",

  ROUND((COALESCE(t.ssa1, 0) + COALESCE(t.formative1_total, 0) + COALESCE(c1.total, COALESCE(t.cia1_total, 0))) / 3.0, 2) AS "c1-before cqi",
  ROUND(COALESCE(cqi.co1, 0) + COALESCE(cqi.co2, 0), 2) AS "c1-after cqi",
  ROUND((COALESCE(t.ssa1, 0) + COALESCE(t.formative1_total, 0) + COALESCE(c1.total, COALESCE(t.cia1_total, 0))) / 3.0, 2) AS "c1-Internal",

  ROUND(COALESCE(t.ssa2, 0) / 2.0, 2) AS "c2-ssa2-co3",
  ROUND(COALESCE(t.ssa2, 0) / 2.0, 2) AS "c2-ssa2-co4",
  ROUND(COALESCE(t.ssa2, 0), 2) AS "c2-ssa2",

  ROUND(COALESCE(t.formative2_total, 0) / 2.0, 2) AS "c2-fa2-co3",
  ROUND(COALESCE(t.formative2_total, 0) / 2.0, 2) AS "c2-fa2-co4",
  ROUND(COALESCE(t.formative2_total, 0), 2) AS "c2-fa2",

  ROUND(COALESCE(c2.co3, 0), 2) AS "c2-cia2-co3",
  ROUND(COALESCE(c2.co4, 0), 2) AS "c2-cia2-co4",
  ROUND(COALESCE(c2.total, COALESCE(t.cia2_total, 0)), 2) AS "c2-cia2",

  ROUND((COALESCE(t.ssa2, 0) + COALESCE(t.formative2_total, 0) + COALESCE(c2.total, COALESCE(t.cia2_total, 0))) / 3.0, 2) AS "c2-before cqi",
  ROUND(COALESCE(cqi.co3, 0) + COALESCE(cqi.co4, 0), 2) AS "c2-after cqi",
  ROUND((COALESCE(t.ssa2, 0) + COALESCE(t.formative2_total, 0) + COALESCE(c2.total, COALESCE(t.cia2_total, 0))) / 3.0, 2) AS "c2-Internal",

  ROUND(COALESCE(m.co1, 0), 2) AS "Model-co1",
  ROUND(COALESCE(m.co2, 0), 2) AS "Model-co2",
  ROUND(COALESCE(m.co3, 0), 2) AS "Model-co3",
  ROUND(COALESCE(m.co4, 0), 2) AS "Model-co4",
  ROUND(COALESCE(m.co5, 0), 2) AS "Model-co5",
  ROUND(COALESCE(m.total, 0), 2) AS "Model",

  ROUND(
    (
      (COALESCE(t.ssa1, 0) + COALESCE(t.formative1_total, 0) + COALESCE(c1.total, COALESCE(t.cia1_total, 0))) / 3.0
      + (COALESCE(t.ssa2, 0) + COALESCE(t.formative2_total, 0) + COALESCE(c2.total, COALESCE(t.cia2_total, 0))) / 3.0
      + COALESCE(m.total, 0)
    ) / 3.0,
    2
  ) AS "before cqi",
  ROUND(COALESCE(cqi.total, 0), 2) AS "after cqi",
  ROUND(
    (
      (COALESCE(t.ssa1, 0) + COALESCE(t.formative1_total, 0) + COALESCE(c1.total, COALESCE(t.cia1_total, 0))) / 3.0
      + (COALESCE(t.ssa2, 0) + COALESCE(t.formative2_total, 0) + COALESCE(c2.total, COALESCE(t.cia2_total, 0))) / 3.0
      + COALESCE(m.total, 0)
    ) / 3.0,
    2
  ) AS "Internal",
  NULL::numeric(10,2) AS "ese"
FROM reporting.vw_pbi_student_subject_base b
LEFT JOIN reporting.vw_pbi_mark_totals t ON t.subject_id = b.subject_id AND t.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_cia1_co_scores c1 ON c1.subject_id = b.subject_id AND c1.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_cia2_co_scores c2 ON c2.subject_id = b.subject_id AND c2.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_model_co_scores m ON m.subject_id = b.subject_id AND m.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_cqi_published_scores cqi ON cqi.subject_id = b.subject_id AND cqi.student_id = b.student_id
WHERE UPPER(COALESCE(b.course_type, '')) IN ('THEORY', 'THEORY_PMBL', 'PRBL')
ORDER BY
  b.student_id,
  b.reg_no_last_12_digit,
  b.name,
  CASE WHEN COALESCE(b.year, '') ~ '^[0-9]+$' THEN b.year::integer ELSE NULL END,
  CASE WHEN COALESCE(b.sem, '') ~ '^[0-9]+$' THEN b.sem::integer ELSE NULL END,
  b.dept,
  b.course_code;

DROP VIEW IF EXISTS reporting.vw_marks_tcpr_tcpl CASCADE;
CREATE VIEW reporting.vw_marks_tcpr_tcpl AS
SELECT
  b.year AS "year",
  b.sem AS "sem",
  b.dept AS "dept",
  b.sec AS "sec",
  b.reg_no_last_12_digit AS "reg no (last 12 digit)",
  b.name AS "name",
  b.course_type AS "course type",
  b.course_code AS "course code",
  b.course_category AS "course category",
  b.course_name AS "course name",

  ROUND(COALESCE(t.ssa1, 0) / 2.0, 2) AS "c1-ssa1-co1",
  ROUND(COALESCE(t.ssa1, 0) / 2.0, 2) AS "c1-ssa1-co2",
  ROUND(COALESCE(t.ssa1, 0), 2) AS "c1-ssa1",

  ROUND(COALESCE(l1.co1, COALESCE(t.formative1_total, 0) / 2.0), 2) AS "c1-lab1-co1",
  ROUND(COALESCE(l1.co2, COALESCE(t.formative1_total, 0) / 2.0), 2) AS "c1-lab1-co2",
  ROUND(COALESCE(l1.total, COALESCE(t.formative1_total, 0)), 2) AS "c1-lab",

  ROUND(COALESCE(c1.co1, 0), 2) AS "c1-cia1-co1",
  ROUND(COALESCE(c1.co2, 0), 2) AS "c1-cia1-co2",
  ROUND(COALESCE(c1.total, COALESCE(t.cia1_total, 0)), 2) AS "c1-cia1",

  ROUND((COALESCE(t.ssa1, 0) + COALESCE(l1.total, COALESCE(t.formative1_total, 0)) + COALESCE(c1.total, COALESCE(t.cia1_total, 0))) / 3.0, 2) AS "c1-before cqi",
  ROUND(COALESCE(cqi.co1, 0) + COALESCE(cqi.co2, 0), 2) AS "c1-after cqi",
  ROUND((COALESCE(t.ssa1, 0) + COALESCE(l1.total, COALESCE(t.formative1_total, 0)) + COALESCE(c1.total, COALESCE(t.cia1_total, 0))) / 3.0, 2) AS "c1-Internal",

  ROUND(COALESCE(t.ssa2, 0) / 2.0, 2) AS "c2-ssa2-co3",
  ROUND(COALESCE(t.ssa2, 0) / 2.0, 2) AS "c2-ssa2-co4",
  ROUND(COALESCE(t.ssa2, 0), 2) AS "c2-ssa2",

  ROUND(COALESCE(l2.co3, COALESCE(t.formative2_total, 0) / 2.0), 2) AS "c2-lab2-co3",
  ROUND(COALESCE(l2.co4, COALESCE(t.formative2_total, 0) / 2.0), 2) AS "c2-lab2-co4",
  ROUND(COALESCE(l2.total, COALESCE(t.formative2_total, 0)), 2) AS "c2-lab2",

  ROUND(COALESCE(c2.co3, 0), 2) AS "c2-cia2-co3",
  ROUND(COALESCE(c2.co4, 0), 2) AS "c2-cia2-co4",
  ROUND(COALESCE(c2.total, COALESCE(t.cia2_total, 0)), 2) AS "c2-cia2",

  ROUND((COALESCE(t.ssa2, 0) + COALESCE(l2.total, COALESCE(t.formative2_total, 0)) + COALESCE(c2.total, COALESCE(t.cia2_total, 0))) / 3.0, 2) AS "c2-before cqi",
  ROUND(COALESCE(cqi.co3, 0) + COALESCE(cqi.co4, 0), 2) AS "c2-after cqi",
  ROUND((COALESCE(t.ssa2, 0) + COALESCE(l2.total, COALESCE(t.formative2_total, 0)) + COALESCE(c2.total, COALESCE(t.cia2_total, 0))) / 3.0, 2) AS "c2-Internal",

  ROUND(COALESCE(lm.co1, 0), 2) AS "Model-lab-co1",
  ROUND(COALESCE(lm.co2, 0), 2) AS "Model-lab-co2",
  ROUND(COALESCE(lm.co3, 0), 2) AS "Model-lab-co3",
  ROUND(COALESCE(lm.co4, 0), 2) AS "Model-lab-co4",
  ROUND(COALESCE(lm.co5, 0), 2) AS "Model-lab-co5",
  ROUND(COALESCE(lm.total, 0), 2) AS "Model-lab",

  ROUND(COALESCE(m.co1, 0), 2) AS "Model-co1",
  ROUND(COALESCE(m.co2, 0), 2) AS "Model-co2",
  ROUND(COALESCE(m.co3, 0), 2) AS "Model-co3",
  ROUND(COALESCE(m.co4, 0), 2) AS "Model-co4",
  ROUND(COALESCE(m.co5, 0), 2) AS "Model-co5",
  ROUND(COALESCE(m.total, 0), 2) AS "Model",

  ROUND(
    (
      (COALESCE(t.ssa1, 0) + COALESCE(l1.total, COALESCE(t.formative1_total, 0)) + COALESCE(c1.total, COALESCE(t.cia1_total, 0))) / 3.0
      + (COALESCE(t.ssa2, 0) + COALESCE(l2.total, COALESCE(t.formative2_total, 0)) + COALESCE(c2.total, COALESCE(t.cia2_total, 0))) / 3.0
      + COALESCE(m.total, 0)
    ) / 3.0,
    2
  ) AS "before cqi",
  ROUND(COALESCE(cqi.total, 0), 2) AS "after cqi",
  ROUND(
    (
      (COALESCE(t.ssa1, 0) + COALESCE(l1.total, COALESCE(t.formative1_total, 0)) + COALESCE(c1.total, COALESCE(t.cia1_total, 0))) / 3.0
      + (COALESCE(t.ssa2, 0) + COALESCE(l2.total, COALESCE(t.formative2_total, 0)) + COALESCE(c2.total, COALESCE(t.cia2_total, 0))) / 3.0
      + COALESCE(m.total, 0)
    ) / 3.0,
    2
  ) AS "Internal",
  NULL::numeric(10,2) AS "ese"
FROM reporting.vw_pbi_student_subject_base b
LEFT JOIN reporting.vw_pbi_mark_totals t ON t.subject_id = b.subject_id AND t.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_cia1_co_scores c1 ON c1.subject_id = b.subject_id AND c1.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_cia2_co_scores c2 ON c2.subject_id = b.subject_id AND c2.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_model_co_scores m ON m.subject_id = b.subject_id AND m.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_lab_assessment_co_scores l1 ON l1.subject_id = b.subject_id AND l1.student_id = b.student_id AND l1.assessment = 'formative1'
LEFT JOIN reporting.vw_pbi_lab_assessment_co_scores l2 ON l2.subject_id = b.subject_id AND l2.student_id = b.student_id AND l2.assessment = 'formative2'
LEFT JOIN reporting.vw_pbi_lab_assessment_co_scores lm ON lm.subject_id = b.subject_id AND lm.student_id = b.student_id AND lm.assessment = 'model'
LEFT JOIN reporting.vw_pbi_cqi_published_scores cqi ON cqi.subject_id = b.subject_id AND cqi.student_id = b.student_id
WHERE UPPER(COALESCE(b.course_type, '')) IN ('TCPR', 'TCPL');

DROP VIEW IF EXISTS reporting.vw_marks_project_lab CASCADE;
CREATE VIEW reporting.vw_marks_project_lab AS
SELECT
  b.year AS "year",
  b.sem AS "sem",
  b.dept AS "dept",
  b.sec AS "sec",
  b.reg_no_last_12_digit AS "reg no (last 12 digit)",
  b.name AS "name",
  b.course_type AS "course type",
  b.course_code AS "course code",
  b.course_category AS "course category",
  b.course_name AS "course name",

  ROUND(COALESCE(pl1.co1, c1.co1, 0), 2) AS "c1-co1",
  ROUND(COALESCE(pl1.co2, c1.co2, 0), 2) AS "c1-co2",
  ROUND(COALESCE(pl1.co3, c1.co3, 0), 2) AS "c1-co3",
  ROUND(COALESCE(pl1.co4, c1.co4, 0), 2) AS "c1-co4",
  ROUND(COALESCE(pl1.co5, c1.co5, 0), 2) AS "c1-co5",
  ROUND(COALESCE(pl1.total, c1.total, t.cia1_total, 0), 2) AS "c1-cia1",
  ROUND(COALESCE(pl1.total, c1.total, t.cia1_total, 0), 2) AS "c1-Internal",

  ROUND(COALESCE(pl2.co1, c2.co1, 0), 2) AS "c2-co1",
  ROUND(COALESCE(pl2.co2, c2.co2, 0), 2) AS "c2-co2",
  ROUND(COALESCE(pl2.co3, c2.co3, 0), 2) AS "c2-co3",
  ROUND(COALESCE(pl2.co4, c2.co4, 0), 2) AS "c2-co4",
  ROUND(COALESCE(pl2.co5, c2.co5, 0), 2) AS "c2-co5",
  ROUND(COALESCE(pl2.total, c2.total, t.cia2_total, 0), 2) AS "c2-cia2",
  ROUND(COALESCE(pl2.total, c2.total, t.cia2_total, 0), 2) AS "c2-Internal",

  ROUND(COALESCE(pm.co1, m.co1, 0), 2) AS "Model-co1",
  ROUND(COALESCE(pm.co2, m.co2, 0), 2) AS "Model-co2",
  ROUND(COALESCE(pm.co3, m.co3, 0), 2) AS "Model-co3",
  ROUND(COALESCE(pm.co4, m.co4, 0), 2) AS "Model-co4",
  ROUND(COALESCE(pm.co5, m.co5, 0), 2) AS "Model-co5",
  ROUND(COALESCE(pm.total, m.total, 0), 2) AS "Model",
  ROUND(COALESCE(pm.total, m.total, 0), 2) AS "Model-Internal",

  ROUND(
    (
      COALESCE(pl1.total, c1.total, t.cia1_total, 0)
      + COALESCE(pl2.total, c2.total, t.cia2_total, 0)
      + COALESCE(pm.total, m.total, 0)
    ) / 3.0,
    2
  ) AS "before cqi",
  ROUND(COALESCE(cqi.total, 0), 2) AS "after cqi",
  ROUND(
    (
      COALESCE(pl1.total, c1.total, t.cia1_total, 0)
      + COALESCE(pl2.total, c2.total, t.cia2_total, 0)
      + COALESCE(pm.total, m.total, 0)
    ) / 3.0,
    2
  ) AS "Internal",
  NULL::numeric(10,2) AS "ese"
FROM reporting.vw_pbi_student_subject_base b
LEFT JOIN reporting.vw_pbi_mark_totals t ON t.subject_id = b.subject_id AND t.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_cia1_co_scores c1 ON c1.subject_id = b.subject_id AND c1.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_cia2_co_scores c2 ON c2.subject_id = b.subject_id AND c2.student_id = b.student_id
LEFT JOIN reporting.vw_pbi_model_co_scores m ON m.subject_id = b.subject_id AND m.student_id = b.student_id
LEFT JOIN LATERAL (
  SELECT
    subject_id,
    student_id,
    SUM(co1) AS co1,
    SUM(co2) AS co2,
    SUM(co3) AS co3,
    SUM(co4) AS co4,
    SUM(co5) AS co5,
    SUM(total) AS total
  FROM reporting.vw_pbi_lab_assessment_co_scores l
  WHERE l.subject_id = b.subject_id
    AND l.student_id = b.student_id
    AND l.assessment IN ('cia1', 'formative1')
  GROUP BY subject_id, student_id
) pl1 ON TRUE
LEFT JOIN LATERAL (
  SELECT
    subject_id,
    student_id,
    SUM(co1) AS co1,
    SUM(co2) AS co2,
    SUM(co3) AS co3,
    SUM(co4) AS co4,
    SUM(co5) AS co5,
    SUM(total) AS total
  FROM reporting.vw_pbi_lab_assessment_co_scores l
  WHERE l.subject_id = b.subject_id
    AND l.student_id = b.student_id
    AND l.assessment IN ('cia2', 'formative2', 'review1')
  GROUP BY subject_id, student_id
) pl2 ON TRUE
LEFT JOIN LATERAL (
  SELECT
    subject_id,
    student_id,
    SUM(co1) AS co1,
    SUM(co2) AS co2,
    SUM(co3) AS co3,
    SUM(co4) AS co4,
    SUM(co5) AS co5,
    SUM(total) AS total
  FROM reporting.vw_pbi_lab_assessment_co_scores l
  WHERE l.subject_id = b.subject_id
    AND l.student_id = b.student_id
    AND l.assessment IN ('model', 'review2')
  GROUP BY subject_id, student_id
) pm ON TRUE
LEFT JOIN reporting.vw_pbi_cqi_published_scores cqi ON cqi.subject_id = b.subject_id AND cqi.student_id = b.student_id
WHERE UPPER(COALESCE(b.course_type, '')) IN ('PROJECT', 'LAB', 'PRACTICAL')
   OR pl1.total IS NOT NULL
   OR pl2.total IS NOT NULL
   OR pm.total IS NOT NULL;

COMMIT;
