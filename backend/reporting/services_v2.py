"""
reporting.services_v2
=====================
Query functions for the v2 Power-BI reporting APIs.

One row per  student × teaching-assignment (course).

Common columns (all 5 APIs)
────────────────────────────
  year, sem, dept, section,
  reg_no, student_name,
  course_type, course_code, course_category, course_name,
  course_staff_name, mentor_name,
  attendance_percentage

Per-exam CO columns come from two sources:
  • SSA1/SSA2/CIA1/CIA2  → AssessmentDraft.data (JSONB LATERAL unnest)
        data shape: { "sheet": { "rows": [{ "studentId": N, "co1": v, "co2": v, … }] } }
        or flat:    { "rows": [ … ] }
  • ModelExam            → obe_modelexamcomark (normalised rows, co_num)
  • Lab exams            → obe_labexamcomark   (normalised rows, co_num)

Overall CO totals (co1–co5) come from obe_cqi_published.entries JSONB
   shape: { "<student_id>": { "co1": v, "co2": v, … } }

Format keys  →  class types
────────────────────────────
  theory       →  THEORY, PRBL, THEORY_PMBL
  tcpr-tcpl    →  TCPR, TCPL
  project-lab  →  PROJECT, LAB
  pure-lab     →  PURE_LAB
  special      →  SPECIAL
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import connection

# ─── Format → allowed class types ────────────────────────────────────────────

V2_CLASS_TYPES: dict[str, list[str]] = {
    "theory":      ["THEORY", "PRBL", "THEORY_PMBL"],
    "tcpr-tcpl":   ["TCPR", "TCPL"],
    "project-lab": ["PROJECT", "LAB"],
    "pure-lab":    ["PURE_LAB"],
    "special":     ["SPECIAL"],
}


@dataclass
class V2QueryResult:
    columns: list[str]
    rows: list[dict[str, Any]]
    total: int


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_int(val: Any, default: int, cap: int) -> int:
    try:
        n = int(val)
    except Exception:
        return default
    return max(1, min(n, cap))


# ─── SQL fragment builders ────────────────────────────────────────────────────

def _draft_lateral_join(assessment: str, co_cols: list[str]) -> str:
    """LATERAL join that extracts per-student CO marks from AssessmentDraft.data.

    assessment : 'ssa1' | 'ssa2' | 'cia1' | 'cia2'
    co_cols    : e.g. ['co1', 'co2']  or  ['co3', 'co4']

    The LATERAL sub-query unnests the rows array in data->sheet->rows (or data->rows),
    filters by studentId, and returns at most one matching row.
    """
    inner_sel = ",\n            ".join(
        f"NULLIF(elem->>''{co}'', '''')::numeric AS {co}" for co in co_cols
    )
    alias = f"draft_{assessment}_co"
    return f"""
    LEFT JOIN LATERAL (
        SELECT
            {inner_sel}
        FROM  obe_assessmentdraft _d_{assessment}
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE
                WHEN (_d_{assessment}.data ? 'sheet')
                 AND (_d_{assessment}.data->'sheet' ? 'rows')
                    THEN _d_{assessment}.data->'sheet'->'rows'
                WHEN _d_{assessment}.data ? 'rows'
                    THEN _d_{assessment}.data->'rows'
                ELSE '[]'::jsonb
            END
        ) AS elem
        WHERE _d_{assessment}.teaching_assignment_id = ta.id
          AND _d_{assessment}.assessment              = '{assessment}'
          AND NULLIF(elem->>'studentId', '')::integer = stud.id
        LIMIT 1
    ) {alias} ON true"""


def _draft_lateral_select(assessment: str, co_cols: list[str]) -> str:
    """SELECT fragment for columns produced by _draft_lateral_join."""
    alias = f"draft_{assessment}_co"
    return ",\n    ".join(
        f"{alias}.{co} AS {assessment}_{co}" for co in co_cols
    )


def _lab_co_joins(lab_alias: str, col_prefix: str) -> str:
    """Five LEFT JOINs on obe_labexamcomark for co_num 1-5.
    lab_alias  : alias of the parent obe_labexammark row (e.g. 'm_lab1')
    col_prefix : prefix for the co-mark alias   (e.g. 'lco_c1')
    """
    lines = []
    for n in range(1, 6):
        lines.append(
            f"    LEFT JOIN obe_labexamcomark {col_prefix}_{n}"
            f" ON {col_prefix}_{n}.lab_exam_mark_id = {lab_alias}.id"
            f" AND {col_prefix}_{n}.co_num = {n}"
        )
    return "\n".join(lines)


def _lab_co_select(col_prefix: str, out_prefix: str) -> str:
    """SELECT fragment for five lab CO mark columns."""
    return ",\n    ".join(
        f"{col_prefix}_{n}.mark AS {out_prefix}_co{n}" for n in range(1, 6)
    )


# ─── Fixed fragment strings ───────────────────────────────────────────────────

# Model exam CO mark JOINs (used by theory, tcpr-tcpl, special)
_MODEL_CO_JOINS = """
    LEFT JOIN obe_modelexamcomark mco1 ON mco1.model_exam_mark_id = m_model.id AND mco1.co_num = 1
    LEFT JOIN obe_modelexamcomark mco2 ON mco2.model_exam_mark_id = m_model.id AND mco2.co_num = 2
    LEFT JOIN obe_modelexamcomark mco3 ON mco3.model_exam_mark_id = m_model.id AND mco3.co_num = 3
    LEFT JOIN obe_modelexamcomark mco4 ON mco4.model_exam_mark_id = m_model.id AND mco4.co_num = 4
    LEFT JOIN obe_modelexamcomark mco5 ON mco5.model_exam_mark_id = m_model.id AND mco5.co_num = 5"""

_MODEL_CO_SELECT = (
    "mco1.mark AS model_co1,\n    mco2.mark AS model_co2,\n    "
    "mco3.mark AS model_co3,\n    mco4.mark AS model_co4,\n    mco5.mark AS model_co5"
)

# Overall CQI published CO totals (last columns in every format)
_CQI_CO_SELECT = """,
    NULLIF((m_cqi.entries -> (stud.id::text)) ->> 'co1', '')::numeric AS co1,
    NULLIF((m_cqi.entries -> (stud.id::text)) ->> 'co2', '')::numeric AS co2,
    NULLIF((m_cqi.entries -> (stud.id::text)) ->> 'co3', '')::numeric AS co3,
    NULLIF((m_cqi.entries -> (stud.id::text)) ->> 'co4', '')::numeric AS co4,
    NULLIF((m_cqi.entries -> (stud.id::text)) ->> 'co5', '')::numeric AS co5"""

# FinalInternalMark + CQI published — joined for every format
_COMMON_MARK_JOINS = """
    LEFT JOIN obe_final_internal_mark m_fim
        ON m_fim.teaching_assignment_id = ta.id
       AND m_fim.student_id             = stud.id
    LEFT JOIN obe_cqi_published m_cqi
        ON m_cqi.teaching_assignment_id = ta.id"""


# ─── Per-format mark fragment builder ────────────────────────────────────────

def _mark_fragments(format_key: str) -> tuple[str, str]:
    """Return (select_sql, join_sql) specific to the format_key.

    The returned SQL is embedded into the main query after the common 13 columns.
    """

    # ── theory ────────────────────────────────────────────────────────────────
    if format_key == "theory":
        sel = f"""
    m_ssa1.mark        AS ssa1,
    {_draft_lateral_select("ssa1", ["co1", "co2"])},
    m_ssa2.mark        AS ssa2,
    {_draft_lateral_select("ssa2", ["co3", "co4"])},
    m_cia1.mark        AS cia1,
    {_draft_lateral_select("cia1", ["co1", "co2"])},
    m_cia2.mark        AS cia2,
    {_draft_lateral_select("cia2", ["co3", "co4"])},
    m_model.total_mark AS model_exam,
    {_MODEL_CO_SELECT},
    m_fim.final_mark   AS internal_mark{_CQI_CO_SELECT}"""

        jns = (
            _COMMON_MARK_JOINS
            + """
    LEFT JOIN obe_ssa1mark m_ssa1  ON m_ssa1.teaching_assignment_id = ta.id  AND m_ssa1.student_id  = stud.id
    LEFT JOIN obe_ssa2mark m_ssa2  ON m_ssa2.teaching_assignment_id = ta.id  AND m_ssa2.student_id  = stud.id
    LEFT JOIN obe_cia1mark m_cia1  ON m_cia1.teaching_assignment_id = ta.id  AND m_cia1.student_id  = stud.id
    LEFT JOIN obe_cia2mark m_cia2  ON m_cia2.teaching_assignment_id = ta.id  AND m_cia2.student_id  = stud.id
    LEFT JOIN obe_modelexammark m_model ON m_model.teaching_assignment_id = ta.id AND m_model.student_id = stud.id"""
            + _MODEL_CO_JOINS
            + _draft_lateral_join("ssa1", ["co1", "co2"])
            + _draft_lateral_join("ssa2", ["co3", "co4"])
            + _draft_lateral_join("cia1", ["co1", "co2"])
            + _draft_lateral_join("cia2", ["co3", "co4"])
        )
        return sel, jns

    # ── tcpr-tcpl ─────────────────────────────────────────────────────────────
    if format_key == "tcpr-tcpl":
        lab_c1_co = _lab_co_select("lco_c1", "lab_cia1")
        lab_c2_co = _lab_co_select("lco_c2", "lab_cia2")

        sel = f"""
    m_ssa1.mark        AS ssa1,
    {_draft_lateral_select("ssa1", ["co1", "co2"])},
    m_ssa2.mark        AS ssa2,
    {_draft_lateral_select("ssa2", ["co3", "co4"])},
    m_cia1.mark        AS cia1,
    {_draft_lateral_select("cia1", ["co1", "co2"])},
    m_cia2.mark        AS cia2,
    {_draft_lateral_select("cia2", ["co3", "co4"])},
    m_model.total_mark AS model_exam,
    {_MODEL_CO_SELECT},
    m_form1.total      AS formative1,
    m_form2.total      AS formative2,
    m_lab1.total_mark  AS lab_cia1,
    {lab_c1_co},
    m_lab2.total_mark  AS lab_cia2,
    {lab_c2_co},
    m_fim.final_mark   AS final_internal{_CQI_CO_SELECT}"""

        jns = (
            _COMMON_MARK_JOINS
            + """
    LEFT JOIN obe_ssa1mark      m_ssa1  ON m_ssa1.teaching_assignment_id  = ta.id AND m_ssa1.student_id  = stud.id
    LEFT JOIN obe_ssa2mark      m_ssa2  ON m_ssa2.teaching_assignment_id  = ta.id AND m_ssa2.student_id  = stud.id
    LEFT JOIN obe_cia1mark      m_cia1  ON m_cia1.teaching_assignment_id  = ta.id AND m_cia1.student_id  = stud.id
    LEFT JOIN obe_cia2mark      m_cia2  ON m_cia2.teaching_assignment_id  = ta.id AND m_cia2.student_id  = stud.id
    LEFT JOIN obe_modelexammark m_model ON m_model.teaching_assignment_id = ta.id AND m_model.student_id = stud.id
    LEFT JOIN obe_formative1mark m_form1 ON m_form1.teaching_assignment_id = ta.id AND m_form1.student_id = stud.id
    LEFT JOIN obe_formative2mark m_form2 ON m_form2.teaching_assignment_id = ta.id AND m_form2.student_id = stud.id
    LEFT JOIN obe_labexammark m_lab1
        ON m_lab1.teaching_assignment_id = ta.id AND m_lab1.student_id = stud.id AND m_lab1.assessment = 'cia1'
    LEFT JOIN obe_labexammark m_lab2
        ON m_lab2.teaching_assignment_id = ta.id AND m_lab2.student_id = stud.id AND m_lab2.assessment = 'cia2'"""
            + _MODEL_CO_JOINS
            + "\n" + _lab_co_joins("m_lab1", "lco_c1")
            + "\n" + _lab_co_joins("m_lab2", "lco_c2")
            + _draft_lateral_join("ssa1", ["co1", "co2"])
            + _draft_lateral_join("ssa2", ["co3", "co4"])
            + _draft_lateral_join("cia1", ["co1", "co2"])
            + _draft_lateral_join("cia2", ["co3", "co4"])
        )
        return sel, jns

    # ── project-lab ───────────────────────────────────────────────────────────
    if format_key == "project-lab":
        lab_c1_co  = _lab_co_select("lco_c1",  "lab_cia1")
        lab_c2_co  = _lab_co_select("lco_c2",  "lab_cia2")
        lab_mdl_co = _lab_co_select("lco_mdl", "lab_model")

        sel = f"""
    m_rev1.mark           AS review1,
    m_rev2.mark           AS review2,
    m_form1.total         AS formative1,
    m_form2.total         AS formative2,
    m_lab1.total_mark     AS lab_cia1,
    {lab_c1_co},
    m_lab2.total_mark     AS lab_cia2,
    {lab_c2_co},
    m_lab_mdl.total_mark  AS lab_model,
    {lab_mdl_co},
    m_fim.final_mark      AS final_internal{_CQI_CO_SELECT}"""

        jns = (
            _COMMON_MARK_JOINS
            + """
    LEFT JOIN obe_review1mark    m_rev1  ON m_rev1.teaching_assignment_id  = ta.id AND m_rev1.student_id  = stud.id
    LEFT JOIN obe_review2mark    m_rev2  ON m_rev2.teaching_assignment_id  = ta.id AND m_rev2.student_id  = stud.id
    LEFT JOIN obe_formative1mark m_form1 ON m_form1.teaching_assignment_id = ta.id AND m_form1.student_id = stud.id
    LEFT JOIN obe_formative2mark m_form2 ON m_form2.teaching_assignment_id = ta.id AND m_form2.student_id = stud.id
    LEFT JOIN obe_labexammark m_lab1
        ON m_lab1.teaching_assignment_id = ta.id AND m_lab1.student_id = stud.id AND m_lab1.assessment = 'cia1'
    LEFT JOIN obe_labexammark m_lab2
        ON m_lab2.teaching_assignment_id = ta.id AND m_lab2.student_id = stud.id AND m_lab2.assessment = 'cia2'
    LEFT JOIN obe_labexammark m_lab_mdl
        ON m_lab_mdl.teaching_assignment_id = ta.id AND m_lab_mdl.student_id = stud.id AND m_lab_mdl.assessment = 'model'"""
            + "\n" + _lab_co_joins("m_lab1",   "lco_c1")
            + "\n" + _lab_co_joins("m_lab2",   "lco_c2")
            + "\n" + _lab_co_joins("m_lab_mdl","lco_mdl")
        )
        return sel, jns

    # ── pure-lab ──────────────────────────────────────────────────────────────
    if format_key == "pure-lab":
        lab_c1_co  = _lab_co_select("lco_c1",  "lab_cia1")
        lab_c2_co  = _lab_co_select("lco_c2",  "lab_cia2")
        lab_mdl_co = _lab_co_select("lco_mdl", "lab_model")

        sel = f"""
    m_form1.total         AS formative1,
    m_form2.total         AS formative2,
    m_lab1.total_mark     AS lab_cia1,
    {lab_c1_co},
    m_lab2.total_mark     AS lab_cia2,
    {lab_c2_co},
    m_lab_mdl.total_mark  AS lab_model,
    {lab_mdl_co},
    m_fim.final_mark      AS final_internal{_CQI_CO_SELECT}"""

        jns = (
            _COMMON_MARK_JOINS
            + """
    LEFT JOIN obe_formative1mark m_form1 ON m_form1.teaching_assignment_id = ta.id AND m_form1.student_id = stud.id
    LEFT JOIN obe_formative2mark m_form2 ON m_form2.teaching_assignment_id = ta.id AND m_form2.student_id = stud.id
    LEFT JOIN obe_labexammark m_lab1
        ON m_lab1.teaching_assignment_id = ta.id AND m_lab1.student_id = stud.id AND m_lab1.assessment = 'cia1'
    LEFT JOIN obe_labexammark m_lab2
        ON m_lab2.teaching_assignment_id = ta.id AND m_lab2.student_id = stud.id AND m_lab2.assessment = 'cia2'
    LEFT JOIN obe_labexammark m_lab_mdl
        ON m_lab_mdl.teaching_assignment_id = ta.id AND m_lab_mdl.student_id = stud.id AND m_lab_mdl.assessment = 'model'"""
            + "\n" + _lab_co_joins("m_lab1",   "lco_c1")
            + "\n" + _lab_co_joins("m_lab2",   "lco_c2")
            + "\n" + _lab_co_joins("m_lab_mdl","lco_mdl")
        )
        return sel, jns

    # ── special ───────────────────────────────────────────────────────────────
    # All assessment types; NULL where not applicable for a given course.
    lab_c1_co  = _lab_co_select("lco_c1",  "lab_cia1")
    lab_c2_co  = _lab_co_select("lco_c2",  "lab_cia2")
    lab_mdl_co = _lab_co_select("lco_mdl", "lab_model")

    sel = f"""
    m_ssa1.mark           AS ssa1,
    {_draft_lateral_select("ssa1", ["co1", "co2"])},
    m_ssa2.mark           AS ssa2,
    {_draft_lateral_select("ssa2", ["co3", "co4"])},
    m_cia1.mark           AS cia1,
    {_draft_lateral_select("cia1", ["co1", "co2"])},
    m_cia2.mark           AS cia2,
    {_draft_lateral_select("cia2", ["co3", "co4"])},
    m_model.total_mark    AS model_exam,
    {_MODEL_CO_SELECT},
    m_form1.total         AS formative1,
    m_form2.total         AS formative2,
    m_rev1.mark           AS review1,
    m_rev2.mark           AS review2,
    m_lab1.total_mark     AS lab_cia1,
    {lab_c1_co},
    m_lab2.total_mark     AS lab_cia2,
    {lab_c2_co},
    m_lab_mdl.total_mark  AS lab_model,
    {lab_mdl_co},
    m_fim.final_mark      AS final_internal{_CQI_CO_SELECT}"""

    jns = (
        _COMMON_MARK_JOINS
        + """
    LEFT JOIN obe_ssa1mark       m_ssa1  ON m_ssa1.teaching_assignment_id  = ta.id AND m_ssa1.student_id  = stud.id
    LEFT JOIN obe_ssa2mark       m_ssa2  ON m_ssa2.teaching_assignment_id  = ta.id AND m_ssa2.student_id  = stud.id
    LEFT JOIN obe_cia1mark       m_cia1  ON m_cia1.teaching_assignment_id  = ta.id AND m_cia1.student_id  = stud.id
    LEFT JOIN obe_cia2mark       m_cia2  ON m_cia2.teaching_assignment_id  = ta.id AND m_cia2.student_id  = stud.id
    LEFT JOIN obe_modelexammark  m_model ON m_model.teaching_assignment_id = ta.id AND m_model.student_id = stud.id
    LEFT JOIN obe_formative1mark m_form1 ON m_form1.teaching_assignment_id = ta.id AND m_form1.student_id = stud.id
    LEFT JOIN obe_formative2mark m_form2 ON m_form2.teaching_assignment_id = ta.id AND m_form2.student_id = stud.id
    LEFT JOIN obe_review1mark    m_rev1  ON m_rev1.teaching_assignment_id  = ta.id AND m_rev1.student_id  = stud.id
    LEFT JOIN obe_review2mark    m_rev2  ON m_rev2.teaching_assignment_id  = ta.id AND m_rev2.student_id  = stud.id
    LEFT JOIN obe_labexammark m_lab1
        ON m_lab1.teaching_assignment_id = ta.id AND m_lab1.student_id = stud.id AND m_lab1.assessment = 'cia1'
    LEFT JOIN obe_labexammark m_lab2
        ON m_lab2.teaching_assignment_id = ta.id AND m_lab2.student_id = stud.id AND m_lab2.assessment = 'cia2'
    LEFT JOIN obe_labexammark m_lab_mdl
        ON m_lab_mdl.teaching_assignment_id = ta.id AND m_lab_mdl.student_id = stud.id AND m_lab_mdl.assessment = 'model'"""
        + _MODEL_CO_JOINS
        + "\n" + _lab_co_joins("m_lab1",   "lco_c1")
        + "\n" + _lab_co_joins("m_lab2",   "lco_c2")
        + "\n" + _lab_co_joins("m_lab_mdl","lco_mdl")
        + _draft_lateral_join("ssa1", ["co1", "co2"])
        + _draft_lateral_join("ssa2", ["co3", "co4"])
        + _draft_lateral_join("cia1", ["co1", "co2"])
        + _draft_lateral_join("cia2", ["co3", "co4"])
    )
    return sel, jns


# ─── WHERE clause builder ─────────────────────────────────────────────────────

def _build_v2_where(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params:  list[Any] = []

    year        = str(filters.get("year")        or "").strip()
    sem         = str(filters.get("sem")         or "").strip()
    dept        = str(filters.get("dept")        or "").strip()
    section     = str(filters.get("section")     or "").strip()
    course_code = str(filters.get("course_code") or "").strip()

    if year:
        clauses.append("ay.name = %s")
        params.append(year)
    if sem:
        clauses.append(
            "COALESCE(sem_cd.number, sem_es.number, sem_sec.number)::text = %s"
        )
        params.append(sem)
    if dept:
        clauses.append("COALESCE(d_cd.code, d_es.code, d_sec.code) = %s")
        params.append(dept)
    if section:
        clauses.append("sec.name = %s")
        params.append(section)
    if course_code:
        clauses.append(
            "UPPER(TRIM(COALESCE(cd.course_code, es.course_code, ''))) = UPPER(%s)"
        )
        params.append(course_code)

    if not clauses:
        return "", []
    return " WHERE " + " AND ".join(clauses), params


# ─── Main query ───────────────────────────────────────────────────────────────

def query_v2_marks(
    *,
    format_key: str,
    filters: dict[str, Any],
    page: Any = None,
    page_size: Any = None,
) -> V2QueryResult:
    """Execute the v2 student-level marks query.

    Returns one row per student × teaching-assignment.
    Page 1 returns the full filtered result in one scan (no LIMIT).
    Page > 1 uses LIMIT/OFFSET with a COUNT pass.

    Column order per format
    ───────────────────────
    THEORY       : common(13) + ssa1, ssa1_co1, ssa1_co2,
                               ssa2, ssa2_co3, ssa2_co4,
                               cia1, cia1_co1, cia1_co2,
                               cia2, cia2_co3, cia2_co4,
                               model_exam, model_co1-5,
                               internal_mark,
                               co1-5
    TCPR/TCPL    : common(13) + ssa1..cia2(with COs), model_exam+COs,
                               formative1, formative2,
                               lab_cia1+lab_cia1_co1-5,
                               lab_cia2+lab_cia2_co1-5,
                               final_internal, co1-5
    PROJECT/LAB  : common(13) + review1, review2, formative1, formative2,
                               lab_cia1+COs, lab_cia2+COs,
                               lab_model+COs, final_internal, co1-5
    PURE_LAB     : common(13) + formative1, formative2,
                               lab_cia1+COs, lab_cia2+COs,
                               lab_model+COs, final_internal, co1-5
    SPECIAL      : common(13) + all assessments + all COs (NULL where N/A)
    """
    class_types = V2_CLASS_TYPES.get(format_key)
    if not class_types:
        raise ValueError(f"Unknown v2 format key: {format_key!r}")

    pg  = _parse_int(page,      default=1,   cap=100_000)
    psz = _parse_int(page_size, default=500, cap=5_000)
    offset = (pg - 1) * psz

    mark_sel, mark_jns = _mark_fragments(format_key)
    where_sql, where_params = _build_v2_where(filters)

    base_sql = f"""
WITH ta_students AS (
    -- Regular curriculum subjects: every student in the teaching-assignment's section
    SELECT ta.id   AS ta_id,
           stud.id AS student_id
    FROM   academics_teachingassignment ta
    JOIN   academics_studentprofile stud
               ON stud.section_id = ta.section_id
    JOIN   curriculum_curriculumdepartment cd
               ON cd.id = ta.curriculum_row_id
    WHERE  ta.is_active           = TRUE
      AND  ta.curriculum_row_id  IS NOT NULL
      AND  UPPER(TRIM(COALESCE(cd.class_type, ''))) = ANY(%s)

    UNION ALL

    -- Elective subjects: only students who explicitly chose this elective
    SELECT ta.id          AS ta_id,
           ec.student_id
    FROM   academics_teachingassignment ta
    JOIN   curriculum_electivechoice ec
               ON  ec.elective_subject_id = ta.elective_subject_id
              AND  ec.academic_year_id    = ta.academic_year_id
              AND  ec.is_active           = TRUE
    JOIN   curriculum_electivesubject es
               ON es.id = ta.elective_subject_id
    WHERE  ta.is_active             = TRUE
      AND  ta.elective_subject_id  IS NOT NULL
      AND  UPPER(TRIM(COALESCE(es.class_type, ''))) = ANY(%s)
)
SELECT
    -- ── identity ──────────────────────────────────────────────────────────
    ay.name                                                                     AS year,
    COALESCE(sem_cd.number, sem_es.number, sem_sec.number)::text                AS sem,
    COALESCE(d_cd.code, d_es.code, d_sec.code)                                  AS dept,
    sec.name                                                                    AS section,
    stud.reg_no,
    TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')))      AS student_name,
    -- ── course ────────────────────────────────────────────────────────────
    UPPER(TRIM(COALESCE(cd.class_type, es.class_type, '')))                     AS course_type,
    COALESCE(cd.course_code, es.course_code)                                    AS course_code,
    COALESCE(cd.category,    es.category)                                       AS course_category,
    COALESCE(cd.course_name, es.course_name)                                    AS course_name,
    -- ── staff & mentor ────────────────────────────────────────────────────
    TRIM(CONCAT(COALESCE(su.first_name,''), ' ', COALESCE(su.last_name,'')))    AS course_staff_name,
    TRIM(CONCAT(COALESCE(mu.first_name,''), ' ', COALESCE(mu.last_name,'')))    AS mentor_name,
    -- ── attendance (period-wise, scoped to this teaching assignment) ──────
    CASE
        WHEN att.total_sessions > 0
        THEN ROUND(att.present_count * 100.0 / att.total_sessions, 2)
        ELSE NULL
    END                                                                         AS attendance_percentage,
    -- ── assessment marks + CO breakdown (format-specific) ─────────────────{mark_sel}
FROM   ta_students ts
JOIN   academics_teachingassignment ta  ON ta.id   = ts.ta_id
JOIN   academics_studentprofile stud    ON stud.id = ts.student_id
JOIN   auth_user u                      ON u.id    = stud.user_id
JOIN   academics_academicyear ay        ON ay.id   = ta.academic_year_id
JOIN   academics_staffprofile sp        ON sp.id   = ta.staff_id
JOIN   auth_user su                     ON su.id   = sp.user_id
LEFT   JOIN academics_section sec       ON sec.id  = ta.section_id
LEFT   JOIN academics_batch b           ON b.id    = sec.batch_id
LEFT   JOIN academics_course c          ON c.id    = b.course_id
LEFT   JOIN academics_department d_sec
               ON d_sec.id = COALESCE(b.department_id, c.department_id)
LEFT   JOIN curriculum_curriculumdepartment cd  ON cd.id = ta.curriculum_row_id
LEFT   JOIN curriculum_electivesubject      es  ON es.id = ta.elective_subject_id
LEFT   JOIN academics_department d_cd  ON d_cd.id  = cd.department_id
LEFT   JOIN academics_department d_es  ON d_es.id  = es.department_id
LEFT   JOIN academics_semester   sem_cd  ON sem_cd.id  = cd.semester_id
LEFT   JOIN academics_semester   sem_es  ON sem_es.id  = es.semester_id
LEFT   JOIN academics_semester   sem_sec ON sem_sec.id = sec.semester_id
-- mentor
LEFT   JOIN academics_studentmentormap smm
               ON smm.student_id = stud.id AND smm.is_active = TRUE
LEFT   JOIN academics_staffprofile msp ON msp.id = smm.mentor_id
LEFT   JOIN auth_user mu               ON mu.id  = msp.user_id
-- attendance aggregate per student per teaching-assignment
LEFT   JOIN (
    SELECT  pas.teaching_assignment_id,
            par.student_id,
            COUNT(*)                                            AS total_sessions,
            SUM(CASE WHEN par.status = 'P' THEN 1 ELSE 0 END) AS present_count
    FROM    academics_periodattendancesession pas
    JOIN    academics_periodattendancerecord  par
                ON par.session_id = pas.id
    WHERE   pas.teaching_assignment_id IS NOT NULL
    GROUP   BY pas.teaching_assignment_id, par.student_id
) att ON att.teaching_assignment_id = ta.id
     AND att.student_id             = stud.id
{mark_jns}
{where_sql}"""

    order_sql = (
        "\nORDER BY ay.name,"
        " COALESCE(sem_cd.number, sem_es.number, sem_sec.number),"
        " COALESCE(d_cd.code, d_es.code, d_sec.code),"
        " sec.name,"
        " stud.reg_no,"
        " COALESCE(cd.course_code, es.course_code)"
    )

    # class_types passed twice: regular CTE branch + elective CTE branch
    base_params: list[Any] = [class_types, class_types, *where_params]

    if pg == 1:
        # Single scan — return full filtered result, no LIMIT
        with connection.cursor() as cursor:
            cursor.execute(base_sql + order_sql, base_params)
            desc    = cursor.description or []
            columns = [d.name for d in desc]
            rows    = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return V2QueryResult(columns=columns, rows=rows, total=len(rows))

    # Paginated
    count_sql = f"SELECT COUNT(*) FROM ({base_sql}) _sub"
    data_sql  = base_sql + order_sql + "\nLIMIT %s OFFSET %s"

    with connection.cursor() as cursor:
        cursor.execute(count_sql, base_params)
        total = int((cursor.fetchone() or [0])[0] or 0)

        cursor.execute(data_sql, [*base_params, psz, offset])
        desc    = cursor.description or []
        columns = [d.name for d in desc]
        rows    = [dict(zip(columns, row)) for row in cursor.fetchall()]

    return V2QueryResult(columns=columns, rows=rows, total=total)
