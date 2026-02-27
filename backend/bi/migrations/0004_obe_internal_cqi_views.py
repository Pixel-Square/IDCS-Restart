from django.db import migrations


VIEW_SQL = r"""
-- Internal-mark mapping maxes (derived from IQAC mapping JSON)
CREATE OR REPLACE VIEW bi_dim_internal_mark_mapping_maxes AS
WITH base AS (
  SELECT
    subject_id,
    mapping::jsonb AS mapping
  FROM obe_internal_mark_mapping
),
expanded AS (
  SELECT
    b.subject_id,
    w.ord AS idx,
    w.val AS weight_raw,
    c.val AS cycle_raw
  FROM base b
  LEFT JOIN LATERAL jsonb_array_elements_text(b.mapping->'weights') WITH ORDINALITY AS w(val, ord) ON TRUE
  LEFT JOIN LATERAL jsonb_array_elements_text(b.mapping->'cycles') WITH ORDINALITY AS c(val, ord) ON c.ord = w.ord
),
parsed AS (
  SELECT
    subject_id,
    idx,
    weight_raw,
    CASE
      WHEN COALESCE(weight_raw, '') ~ '^[0-9]+(\\.[0-9]+)?$' THEN weight_raw::numeric
      ELSE 0::numeric
    END AS weight,
    LOWER(COALESCE(cycle_raw, '')) AS cycle_s
  FROM expanded
),
cycles AS (
  SELECT
    subject_id,
    idx,
    weight_raw,
    weight,
    CASE
      -- must check cycle-2 patterns first ("ii" contains "i")
      WHEN cycle_s LIKE '%cycle ii%' OR cycle_s LIKE '%cycle 2%' OR cycle_s = '2' OR cycle_s = 'ii' OR cycle_s LIKE '%ii%'
        THEN 2
      WHEN cycle_s LIKE '%cycle i%' OR cycle_s LIKE '%cycle 1%' OR cycle_s = '1' OR cycle_s = 'i' OR cycle_s LIKE '%1%'
        THEN 1
      ELSE NULL
    END AS cycle_no
  FROM parsed
)
SELECT
  subject_id,
  CASE
    WHEN COUNT(*) FILTER (WHERE weight_raw IS NOT NULL) = 0 THEN NULL
    ELSE SUM(weight)
  END AS max_total,
  CASE
    WHEN BOOL_OR(cycle_no IS NOT NULL) THEN NULLIF(SUM(CASE WHEN cycle_no = 1 THEN weight ELSE 0 END), 0)
    ELSE NULL
  END AS max_cycle1,
  CASE
    WHEN BOOL_OR(cycle_no IS NOT NULL) THEN NULLIF(SUM(CASE WHEN cycle_no = 2 THEN weight ELSE 0 END), 0)
    ELSE NULL
  END AS max_cycle2
FROM cycles
GROUP BY subject_id;


-- SSA / Review CO splits (derived from total marks + master config)
CREATE OR REPLACE VIEW bi_fact_ssa_co AS
WITH cfg AS (
  SELECT COALESCE(
    (
      SELECT config::jsonb
      FROM obe_assessment_master_config
      ORDER BY id
      LIMIT 1
    ),
    '{}'::jsonb
  ) AS cfg
),
raw AS (
  SELECT
    assessment_key,
    subject_id,
    student_id,
    score::numeric AS total_score
  FROM bi_fact_marks
  WHERE component_key = 'mark'
    AND assessment_key IN ('ssa1', 'review1', 'ssa2', 'review2')
),
assessments AS (
  SELECT DISTINCT assessment_key FROM raw
),
deduped AS (
  SELECT
    a.assessment_key,
    CASE
      WHEN a.assessment_key = 'review1' THEN 15::numeric
      WHEN a.assessment_key = 'ssa1' THEN (
        CASE
          WHEN (cfg.cfg#>>'{assessments,ssa1,coMax,co1}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (cfg.cfg#>>'{assessments,ssa1,coMax,co1}')::numeric
          ELSE 10::numeric
        END
      )
      ELSE 0::numeric
    END AS co1_max,
    CASE
      WHEN a.assessment_key = 'review1' THEN 15::numeric
      WHEN a.assessment_key = 'ssa1' THEN (
        CASE
          WHEN (cfg.cfg#>>'{assessments,ssa1,coMax,co2}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (cfg.cfg#>>'{assessments,ssa1,coMax,co2}')::numeric
          ELSE 10::numeric
        END
      )
      ELSE 0::numeric
    END AS co2_max,
    CASE
      WHEN a.assessment_key = 'review2' THEN 15::numeric
      WHEN a.assessment_key = 'ssa2' THEN (
        CASE
          WHEN (cfg.cfg#>>'{assessments,ssa2,coMax,co3}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (cfg.cfg#>>'{assessments,ssa2,coMax,co3}')::numeric
          WHEN (cfg.cfg#>>'{assessments,ssa2,coMax,co1}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (cfg.cfg#>>'{assessments,ssa2,coMax,co1}')::numeric
          ELSE 10::numeric
        END
      )
      ELSE 0::numeric
    END AS co3_max,
    CASE
      WHEN a.assessment_key = 'review2' THEN 15::numeric
      WHEN a.assessment_key = 'ssa2' THEN (
        CASE
          WHEN (cfg.cfg#>>'{assessments,ssa2,coMax,co4}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (cfg.cfg#>>'{assessments,ssa2,coMax,co4}')::numeric
          WHEN (cfg.cfg#>>'{assessments,ssa2,coMax,co2}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (cfg.cfg#>>'{assessments,ssa2,coMax,co2}')::numeric
          ELSE 10::numeric
        END
      )
      ELSE 0::numeric
    END AS co4_max,
    0::numeric AS co5_max
  FROM assessments a
  CROSS JOIN cfg
),
expanded AS (
  SELECT
    r.assessment_key,
    r.subject_id,
    r.student_id,
    co.co_no,
    co.co_max,
    (COALESCE(d.co1_max, 0) + COALESCE(d.co2_max, 0) + COALESCE(d.co3_max, 0) + COALESCE(d.co4_max, 0) + COALESCE(d.co5_max, 0)) AS sum_max,
    r.total_score
  FROM raw r
  JOIN deduped d ON d.assessment_key = r.assessment_key
  CROSS JOIN LATERAL (
    VALUES
      (1, d.co1_max),
      (2, d.co2_max),
      (3, d.co3_max),
      (4, d.co4_max),
      (5, d.co5_max)
  ) AS co(co_no, co_max)
)
SELECT
  (assessment_key || ':' || subject_id::text || ':' || student_id::text || ':CO' || co_no::text) AS fact_key,
  assessment_key,
  subject_id,
  student_id,
  co_no,
  CASE
    WHEN total_score IS NULL OR sum_max <= 0 OR co_max <= 0 THEN NULL
    ELSE LEAST(GREATEST((total_score / sum_max) * co_max, 0), co_max)
  END AS score,
  NULLIF(co_max, 0) AS max_score,
  CASE
    WHEN total_score IS NULL OR sum_max <= 0 OR co_max <= 0 THEN NULL
    ELSE ((LEAST(GREATEST((total_score / sum_max) * co_max, 0), co_max)) / co_max) * 100
  END AS pct
FROM expanded;


-- Formative CO splits (Formative1 -> CO1/CO2, Formative2 -> CO3/CO4)
CREATE OR REPLACE VIEW bi_fact_formative_co AS
WITH cfg AS (
  SELECT COALESCE(
    (
      SELECT config::jsonb
      FROM obe_assessment_master_config
      ORDER BY id
      LIMIT 1
    ),
    '{}'::jsonb
  ) AS cfg
),
maxes AS (
  SELECT
    (CASE
      WHEN (cfg.cfg#>>'{assessments,formative1,maxCo}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (cfg.cfg#>>'{assessments,formative1,maxCo}')::numeric
      ELSE 10::numeric
    END) AS f1_max_co,
    (CASE
      WHEN (cfg.cfg#>>'{assessments,formative2,maxCo}') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (cfg.cfg#>>'{assessments,formative2,maxCo}')::numeric
      ELSE 10::numeric
    END) AS f2_max_co
  FROM cfg
),
f1 AS (
  SELECT
    'formative1'::text AS assessment_key,
    m.subject_id,
    m.student_id,
    CASE WHEN m.skill1 IS NULL OR m.att1 IS NULL THEN NULL ELSE (m.skill1::numeric + m.att1::numeric) END AS co1,
    CASE WHEN m.skill2 IS NULL OR m.att2 IS NULL THEN NULL ELSE (m.skill2::numeric + m.att2::numeric) END AS co2
  FROM "OBE_formative1mark" m
),
f2 AS (
  SELECT
    'formative2'::text AS assessment_key,
    m.subject_id,
    m.student_id,
    CASE WHEN m.skill1 IS NULL OR m.att1 IS NULL THEN NULL ELSE (m.skill1::numeric + m.att1::numeric) END AS co3,
    CASE WHEN m.skill2 IS NULL OR m.att2 IS NULL THEN NULL ELSE (m.skill2::numeric + m.att2::numeric) END AS co4
  FROM "OBE_formative2mark" m
)
SELECT
  (assessment_key || ':' || subject_id::text || ':' || student_id::text || ':CO' || co_no::text) AS fact_key,
  assessment_key,
  subject_id,
  student_id,
  co_no,
  score,
  max_score,
  CASE WHEN score IS NULL OR max_score IS NULL OR max_score = 0 THEN NULL ELSE (score / max_score) * 100 END AS pct
FROM (
  SELECT
    f1.assessment_key,
    f1.subject_id,
    f1.student_id,
    1 AS co_no,
    f1.co1 AS score,
    NULLIF(mx.f1_max_co, 0) AS max_score
  FROM f1
  CROSS JOIN maxes mx

  UNION ALL

  SELECT
    f1.assessment_key,
    f1.subject_id,
    f1.student_id,
    2 AS co_no,
    f1.co2 AS score,
    NULLIF(mx.f1_max_co, 0) AS max_score
  FROM f1
  CROSS JOIN maxes mx

  UNION ALL

  SELECT
    f2.assessment_key,
    f2.subject_id,
    f2.student_id,
    3 AS co_no,
    f2.co3 AS score,
    NULLIF(mx.f2_max_co, 0) AS max_score
  FROM f2
  CROSS JOIN maxes mx

  UNION ALL

  SELECT
    f2.assessment_key,
    f2.subject_id,
    f2.student_id,
    4 AS co_no,
    f2.co4 AS score,
    NULLIF(mx.f2_max_co, 0) AS max_score
  FROM f2
  CROSS JOIN maxes mx
) x;


-- CQI (C1) computed as per frontend C1CQIPage: weighted blend (SSA1 + CIA1 + Formative1) and 3pt attainment
CREATE OR REPLACE VIEW bi_fact_cqi_c1 AS
WITH cfg AS (
  SELECT COALESCE(
    (
      SELECT config::jsonb
      FROM obe_assessment_master_config
      ORDER BY id
      LIMIT 1
    ),
    '{}'::jsonb
  ) AS cfg
),
-- Base keyspace: any student-subject that has at least one relevant published component
base AS (
  SELECT DISTINCT student_id, subject_id
  FROM bi_fact_marks
  WHERE (assessment_key = 'ssa1' AND component_key = 'mark')
     OR (assessment_key = 'formative1' AND component_key IN ('skill1', 'skill2', 'att1', 'att2', 'total'))
     OR (assessment_key = 'cia1' AND component_key = 'mark')
),
student_ctx AS (
  SELECT
    b.student_id,
    b.subject_id,
    ds.batch_id,
    subj.code AS subject_code,
    subj.semester_id
  FROM base b
  JOIN bi_dim_student ds ON ds.student_id = b.student_id
  JOIN academics_subject subj ON subj.id = b.subject_id
),
curr AS (
  SELECT
    sc.student_id,
    sc.subject_id,
    COALESCE(NULLIF(UPPER(cm.class_type), ''), 'THEORY') AS class_type
  FROM student_ctx sc
  LEFT JOIN academics_batch ab ON ab.id = sc.batch_id
  LEFT JOIN curriculum_regulation reg ON reg.id = ab.regulation_id
  LEFT JOIN curriculum_curriculummaster cm
    ON cm.regulation = reg.code
    AND cm.semester_id = sc.semester_id
    AND cm.course_code = sc.subject_code
),
weights AS (
  SELECT
    c.student_id,
    c.subject_id,
    c.class_type,
    COALESCE(ctw.ssa1::numeric, 1.5::numeric) AS ssa_w,
    COALESCE(ctw.cia1::numeric, 3::numeric) AS cia_w,
    COALESCE(ctw.formative1::numeric, 2.5::numeric) AS f1_w
  FROM curr c
  LEFT JOIN obe_class_type_weights ctw
    ON UPPER(ctw.class_type) = c.class_type
),
ssa1_co AS (
  SELECT student_id, subject_id, co_no, score, max_score
  FROM bi_fact_ssa_co
  WHERE assessment_key = 'ssa1'
),
f1_co AS (
  SELECT student_id, subject_id, co_no, score, max_score
  FROM bi_fact_formative_co
  WHERE assessment_key = 'formative1'
),
cia1_co AS (
  SELECT student_id, subject_id, co_no, score, max_score
  FROM bi_fact_cia_co
  WHERE assessment_key = 'cia1'
),
per_co AS (
  SELECT
    b.student_id,
    b.subject_id,
    gs.co_no,
    w.ssa_w,
    w.cia_w,
    w.f1_w,
    ssa.score AS ssa_mark,
    ssa.max_score AS ssa_max,
    f1.score AS f1_mark,
    f1.max_score AS f1_max,
    cia.score AS cia_mark,
    cia.max_score AS cia_max
  FROM base b
  CROSS JOIN LATERAL (SELECT generate_series(1, 5) AS co_no) gs
  LEFT JOIN weights w ON w.student_id = b.student_id AND w.subject_id = b.subject_id
  LEFT JOIN ssa1_co ssa ON ssa.student_id = b.student_id AND ssa.subject_id = b.subject_id AND ssa.co_no = gs.co_no
  LEFT JOIN f1_co f1 ON f1.student_id = b.student_id AND f1.subject_id = b.subject_id AND f1.co_no = gs.co_no
  LEFT JOIN cia1_co cia ON cia.student_id = b.student_id AND cia.subject_id = b.subject_id AND cia.co_no = gs.co_no
),
computed AS (
  SELECT
    student_id,
    subject_id,
    co_no,
    ssa_mark,
    ssa_max,
    f1_mark,
    f1_max,
    cia_mark,
    cia_max,
    COALESCE(ssa_w, 1.5::numeric) AS ssa_w,
    COALESCE(cia_w, 3::numeric) AS cia_w,
    COALESCE(f1_w, 2.5::numeric) AS f1_w
  FROM per_co
),
blend AS (
  SELECT
    student_id,
    subject_id,
    co_no,
    -- weightedBlendMark from frontend
    CASE
      WHEN ssa_mark IS NULL OR cia_mark IS NULL OR f1_mark IS NULL THEN NULL
      WHEN ssa_max IS NULL OR cia_max IS NULL OR f1_max IS NULL THEN NULL
      WHEN ssa_max <= 0 OR cia_max <= 0 OR f1_max <= 0 THEN NULL
      WHEN (ssa_w + cia_w + f1_w) <= 0 THEN NULL
      ELSE (
        (
          ((ssa_mark / ssa_max) * ssa_w + (cia_mark / cia_max) * cia_w + (f1_mark / f1_max) * f1_w)
          / (ssa_w + cia_w + f1_w)
        )
        * (ssa_max + cia_max + f1_max)
      )
    END AS co_mark,
    (ssa_max + cia_max + f1_max) AS denom
  FROM computed
)
SELECT
  (student_id::text || ':' || subject_id::text) AS row_key,
  student_id,
  subject_id,
  ROUND(SUM(co_mark))::int AS total,
  STRING_AGG(('CO' || co_no::text), '+' ORDER BY co_no) FILTER (
    WHERE (co_mark IS NOT NULL) AND (denom > 0) AND (((co_mark / denom) * 3) < 1.74)
  ) AS cos,

  MAX(ROUND(((co_mark / denom) * 3), 2)) FILTER (WHERE co_no = 1) AS co1_3pt,
  BOOL_OR((((co_mark / denom) * 3) < 1.74)) FILTER (WHERE co_no = 1) AS flag_co1,
  MAX(ROUND(((co_mark / denom) * 3), 2)) FILTER (WHERE co_no = 2) AS co2_3pt,
  BOOL_OR((((co_mark / denom) * 3) < 1.74)) FILTER (WHERE co_no = 2) AS flag_co2,
  MAX(ROUND(((co_mark / denom) * 3), 2)) FILTER (WHERE co_no = 3) AS co3_3pt,
  BOOL_OR((((co_mark / denom) * 3) < 1.74)) FILTER (WHERE co_no = 3) AS flag_co3,
  MAX(ROUND(((co_mark / denom) * 3), 2)) FILTER (WHERE co_no = 4) AS co4_3pt,
  BOOL_OR((((co_mark / denom) * 3) < 1.74)) FILTER (WHERE co_no = 4) AS flag_co4,
  MAX(ROUND(((co_mark / denom) * 3), 2)) FILTER (WHERE co_no = 5) AS co5_3pt,
  BOOL_OR((((co_mark / denom) * 3) < 1.74)) FILTER (WHERE co_no = 5) AS flag_co5
FROM blend
GROUP BY student_id, subject_id;


-- Extend the wide DirectQuery view
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
),
ssa_co_pivot AS (
  SELECT
    student_id,
    subject_id,
    MAX(score) FILTER (WHERE assessment_key = 'ssa1' AND co_no = 1) AS ssa1_co1,
    MAX(max_score) FILTER (WHERE assessment_key = 'ssa1' AND co_no = 1) AS ssa1_co1_max,
    MAX(score) FILTER (WHERE assessment_key = 'ssa1' AND co_no = 2) AS ssa1_co2,
    MAX(max_score) FILTER (WHERE assessment_key = 'ssa1' AND co_no = 2) AS ssa1_co2_max,

    MAX(score) FILTER (WHERE assessment_key = 'review1' AND co_no = 1) AS review1_co1,
    MAX(max_score) FILTER (WHERE assessment_key = 'review1' AND co_no = 1) AS review1_co1_max,
    MAX(score) FILTER (WHERE assessment_key = 'review1' AND co_no = 2) AS review1_co2,
    MAX(max_score) FILTER (WHERE assessment_key = 'review1' AND co_no = 2) AS review1_co2_max,

    MAX(score) FILTER (WHERE assessment_key = 'ssa2' AND co_no = 3) AS ssa2_co3,
    MAX(max_score) FILTER (WHERE assessment_key = 'ssa2' AND co_no = 3) AS ssa2_co3_max,
    MAX(score) FILTER (WHERE assessment_key = 'ssa2' AND co_no = 4) AS ssa2_co4,
    MAX(max_score) FILTER (WHERE assessment_key = 'ssa2' AND co_no = 4) AS ssa2_co4_max,

    MAX(score) FILTER (WHERE assessment_key = 'review2' AND co_no = 3) AS review2_co3,
    MAX(max_score) FILTER (WHERE assessment_key = 'review2' AND co_no = 3) AS review2_co3_max,
    MAX(score) FILTER (WHERE assessment_key = 'review2' AND co_no = 4) AS review2_co4,
    MAX(max_score) FILTER (WHERE assessment_key = 'review2' AND co_no = 4) AS review2_co4_max
  FROM bi_fact_ssa_co
  GROUP BY student_id, subject_id
),
formative_co_pivot AS (
  SELECT
    student_id,
    subject_id,
    MAX(score) FILTER (WHERE assessment_key = 'formative1' AND co_no = 1) AS formative1_co1,
    MAX(max_score) FILTER (WHERE assessment_key = 'formative1' AND co_no = 1) AS formative1_co1_max,
    MAX(score) FILTER (WHERE assessment_key = 'formative1' AND co_no = 2) AS formative1_co2,
    MAX(max_score) FILTER (WHERE assessment_key = 'formative1' AND co_no = 2) AS formative1_co2_max,

    MAX(score) FILTER (WHERE assessment_key = 'formative2' AND co_no = 3) AS formative2_co3,
    MAX(max_score) FILTER (WHERE assessment_key = 'formative2' AND co_no = 3) AS formative2_co3_max,
    MAX(score) FILTER (WHERE assessment_key = 'formative2' AND co_no = 4) AS formative2_co4,
    MAX(max_score) FILTER (WHERE assessment_key = 'formative2' AND co_no = 4) AS formative2_co4_max
  FROM bi_fact_formative_co
  GROUP BY student_id, subject_id
),
curriculum_ctx AS (
  SELECT
    mp.student_id,
    mp.subject_id,
    reg.code AS regulation_code,
    cm.class_type,
    cm.internal_mark::numeric AS internal_mark_max,
    cm.external_mark::numeric AS external_mark_max,
    cm.total_mark::numeric AS total_mark_max
  FROM marks_pivot mp
  JOIN bi_dim_student ds ON ds.student_id = mp.student_id
  JOIN academics_subject subj ON subj.id = mp.subject_id
  LEFT JOIN academics_batch ab ON ab.id = ds.batch_id
  LEFT JOIN curriculum_regulation reg ON reg.id = ab.regulation_id
  LEFT JOIN curriculum_curriculummaster cm
    ON cm.regulation = reg.code
    AND cm.semester_id = subj.semester_id
    AND cm.course_code = subj.code
),
internal_max AS (
  SELECT
    c.student_id,
    c.subject_id,
    COALESCE(c.internal_mark_max, imm.max_total) AS internal_max_total,
    imm.max_cycle1 AS internal_max_cycle1,
    imm.max_cycle2 AS internal_max_cycle2
  FROM curriculum_ctx c
  LEFT JOIN bi_dim_internal_mark_mapping_maxes imm ON imm.subject_id = c.subject_id
),
internal_calc AS (
  SELECT
    mp.student_id,
    mp.subject_id,
    -- internal marks as per backend academics/views.py: sum available components
    CASE
      WHEN mp.formative1_total IS NULL AND mp.formative2_total IS NULL AND mp.ssa1_total IS NULL AND mp.ssa2_total IS NULL AND mp.review1_total IS NULL AND mp.review2_total IS NULL
        THEN NULL
      ELSE COALESCE(mp.formative1_total, 0) + COALESCE(mp.formative2_total, 0) + COALESCE(mp.ssa1_total, 0) + COALESCE(mp.ssa2_total, 0) + COALESCE(mp.review1_total, 0) + COALESCE(mp.review2_total, 0)
    END AS internal_computed,

    CASE
      WHEN mp.formative1_total IS NULL AND mp.ssa1_total IS NULL AND mp.review1_total IS NULL
        THEN NULL
      ELSE COALESCE(mp.formative1_total, 0) + COALESCE(mp.ssa1_total, 0) + COALESCE(mp.review1_total, 0)
    END AS internal_cycle1,

    CASE
      WHEN mp.formative2_total IS NULL AND mp.ssa2_total IS NULL AND mp.review2_total IS NULL
        THEN NULL
      ELSE COALESCE(mp.formative2_total, 0) + COALESCE(mp.ssa2_total, 0) + COALESCE(mp.review2_total, 0)
    END AS internal_cycle2
  FROM marks_pivot mp
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

  -- CIA CO splits (existing) - keep the original 0003 order
  ccp.cia1_co1,
  ccp.cia1_co1_max,
  ccp.cia1_co2,
  ccp.cia1_co2_max,
  ccp.cia2_co3,
  ccp.cia2_co3_max,
  ccp.cia2_co4,
  ccp.cia2_co4_max,

  -- SSA/Review CO splits
  scp.ssa1_co1,
  scp.ssa1_co1_max,
  scp.ssa1_co2,
  scp.ssa1_co2_max,
  scp.review1_co1,
  scp.review1_co1_max,
  scp.review1_co2,
  scp.review1_co2_max,
  scp.ssa2_co3,
  scp.ssa2_co3_max,
  scp.ssa2_co4,
  scp.ssa2_co4_max,
  scp.review2_co3,
  scp.review2_co3_max,
  scp.review2_co4,
  scp.review2_co4_max,

  -- Formative CO splits
  fcp.formative1_co1,
  fcp.formative1_co1_max,
  fcp.formative1_co2,
  fcp.formative1_co2_max,
  fcp.formative2_co3,
  fcp.formative2_co3_max,
  fcp.formative2_co4,
  fcp.formative2_co4_max,

  -- Curriculum context (new)
  cc.regulation_code,
  cc.class_type,
  cc.internal_mark_max,
  cc.external_mark_max,
  cc.total_mark_max,

  -- Internal marks (computed + maxes)
  ic.internal_computed,
  ic.internal_cycle1,
  ic.internal_cycle2,
  im.internal_max_total,
  COALESCE(im.internal_max_cycle1, CASE WHEN im.internal_max_total IS NULL THEN NULL ELSE im.internal_max_total / 2 END) AS internal_max_cycle1,
  COALESCE(im.internal_max_cycle2, CASE WHEN im.internal_max_total IS NULL THEN NULL ELSE im.internal_max_total / 2 END) AS internal_max_cycle2,

  -- CQI (C1)
  cqi.total AS cqi_c1_total,
  cqi.cos AS cqi_c1_cos,
  cqi.co1_3pt AS cqi_c1_co1_3pt,
  cqi.flag_co1 AS cqi_c1_flag_co1,
  cqi.co2_3pt AS cqi_c1_co2_3pt,
  cqi.flag_co2 AS cqi_c1_flag_co2,
  cqi.co3_3pt AS cqi_c1_co3_3pt,
  cqi.flag_co3 AS cqi_c1_flag_co3,
  cqi.co4_3pt AS cqi_c1_co4_3pt,
  cqi.flag_co4 AS cqi_c1_flag_co4,
  cqi.co5_3pt AS cqi_c1_co5_3pt,
  cqi.flag_co5 AS cqi_c1_flag_co5
FROM marks_pivot mp
JOIN bi_dim_student ds ON ds.student_id = mp.student_id
JOIN academics_subject subj ON subj.id = mp.subject_id
LEFT JOIN academics_section sec ON sec.id = ds.section_id
LEFT JOIN academics_semester sem ON sem.id = sec.semester_id
LEFT JOIN cia_co_pivot ccp ON ccp.student_id = mp.student_id AND ccp.subject_id = mp.subject_id
LEFT JOIN ssa_co_pivot scp ON scp.student_id = mp.student_id AND scp.subject_id = mp.subject_id
LEFT JOIN formative_co_pivot fcp ON fcp.student_id = mp.student_id AND fcp.subject_id = mp.subject_id
LEFT JOIN curriculum_ctx cc ON cc.student_id = mp.student_id AND cc.subject_id = mp.subject_id
LEFT JOIN internal_max im ON im.student_id = mp.student_id AND im.subject_id = mp.subject_id
LEFT JOIN internal_calc ic ON ic.student_id = mp.student_id AND ic.subject_id = mp.subject_id
LEFT JOIN bi_fact_cqi_c1 cqi ON cqi.student_id = mp.student_id AND cqi.subject_id = mp.subject_id
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


REVERSE_SQL = r"""
-- Drop dependent wide view first (it references the views below)
DROP VIEW IF EXISTS bi_obe_student_subject_wide;

-- Drop new supporting views
DROP VIEW IF EXISTS bi_fact_cqi_c1;
DROP VIEW IF EXISTS bi_fact_formative_co;
DROP VIEW IF EXISTS bi_fact_ssa_co;
DROP VIEW IF EXISTS bi_dim_internal_mark_mapping_maxes;

-- Restore previous version of the wide view (from migration 0003)
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


class Migration(migrations.Migration):
    dependencies = [
        ('bi', '0003_obe_student_subject_wide'),
    ]

    operations = [
        migrations.RunSQL(VIEW_SQL, reverse_sql=REVERSE_SQL),
    ]
