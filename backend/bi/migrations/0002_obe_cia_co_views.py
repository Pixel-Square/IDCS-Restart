from django.db import migrations


VIEW_SQL = r"""
CREATE OR REPLACE VIEW bi_fact_cia_question_marks AS
WITH pubs AS (
  SELECT 'cia1'::text AS assessment_key, subject_id, data::jsonb AS data, updated_at
  FROM "OBE_cia1publishedsheet"

  UNION ALL

  SELECT 'cia2'::text AS assessment_key, subject_id, data::jsonb AS data, updated_at
  FROM "OBE_cia2publishedsheet"
),
questions AS (
  SELECT
    p.assessment_key,
    p.subject_id,
    q.ord AS question_ord,
    q.q AS question
  FROM pubs p
  LEFT JOIN LATERAL jsonb_array_elements(p.data->'questions') WITH ORDINALITY AS q(q, ord) ON TRUE
),
rows AS (
  SELECT
    p.assessment_key,
    p.subject_id,
    (r.sid)::bigint AS student_id,
    r.row AS row
  FROM pubs p
  LEFT JOIN LATERAL (
    SELECT sid, row
    FROM jsonb_each(p.data->'rowsByStudentId') AS x(sid, row)
    WHERE x.sid ~ '^[0-9]+$'
  ) AS r(sid, row) ON TRUE
)
SELECT
  (
    rows.assessment_key
    || ':' || rows.subject_id::text
    || ':' || rows.student_id::text
    || ':' || COALESCE(questions.question->>'key', '')
  ) AS fact_key,
  rows.assessment_key,
  rows.subject_id,
  rows.student_id,
  COALESCE(questions.question->>'key', '') AS question_key,
  COALESCE(questions.question->>'label', '') AS question_label,
  CASE
    WHEN COALESCE(questions.question->>'max', '') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (questions.question->>'max')::numeric
    ELSE NULL
  END AS question_max,
  COALESCE(questions.question->>'co', '') AS question_co_raw,
  COALESCE((rows.row->>'absent')::boolean, FALSE) AS absent,
  CASE
    WHEN NULLIF((rows.row->'q'->>(questions.question->>'key'))::text, '') ~ '^[0-9]+(\\.[0-9]+)?$'
      THEN NULLIF((rows.row->'q'->>(questions.question->>'key'))::text, '')::numeric
    ELSE NULL
  END AS mark,
  questions.question_ord
FROM rows
JOIN questions
  ON questions.assessment_key = rows.assessment_key
  AND questions.subject_id = rows.subject_id
WHERE COALESCE(questions.question->>'key', '') <> ''
  AND rows.student_id IS NOT NULL;


CREATE OR REPLACE VIEW bi_fact_cia_co AS
WITH qmarks AS (
  SELECT
    assessment_key,
    subject_id,
    student_id,
    question_key,
    question_max,
    question_co_raw,
    absent,
    COALESCE(mark, 0) AS mark
  FROM bi_fact_cia_question_marks
),
co_lines AS (
  SELECT
    *,
    CASE
      WHEN question_co_raw IN ('both', '1&2', '1,2', '12', '1/2', '2/1') THEN ARRAY[1, 2]
      WHEN question_co_raw IN ('3&4', '3,4', '34', '3/4', '4/3') THEN ARRAY[3, 4]
      WHEN question_co_raw ~ '^[0-9]+$' THEN ARRAY[question_co_raw::int]
      ELSE ARRAY[]::int[]
    END AS cos
  FROM qmarks
),
expanded AS (
  SELECT
    assessment_key,
    subject_id,
    student_id,
    absent,
    unnest(cos) AS co_no,
    CASE WHEN array_length(cos, 1) = 2 THEN 0.5::numeric ELSE 1::numeric END AS weight,
    mark,
    COALESCE(question_max, 0) AS question_max
  FROM co_lines
  WHERE array_length(cos, 1) IS NOT NULL
)
SELECT
  (assessment_key || ':' || subject_id::text || ':' || student_id::text || ':CO' || co_no::text) AS fact_key,
  assessment_key,
  subject_id,
  student_id,
  co_no,
  SUM((CASE WHEN absent THEN 0 ELSE mark END) * weight) AS score,
  SUM(question_max * weight) AS max_score,
  CASE
    WHEN SUM(question_max * weight) = 0 THEN NULL
    ELSE (SUM((CASE WHEN absent THEN 0 ELSE mark END) * weight) / SUM(question_max * weight)) * 100
  END AS pct
FROM expanded
GROUP BY assessment_key, subject_id, student_id, co_no;
"""


DROP_SQL = r"""
DROP VIEW IF EXISTS bi_fact_cia_co;
DROP VIEW IF EXISTS bi_fact_cia_question_marks;
"""


class Migration(migrations.Migration):
    dependencies = [
        ('bi', '0001_views'),
    ]

    operations = [
        migrations.RunSQL(VIEW_SQL, reverse_sql=DROP_SQL),
    ]
