"""reporting.services_v2_acv2

Academic 2.1 (acv2_*) implementation for the v2 Power BI endpoints.

Important:
- The original v2 implementation (services_v2.py) relies on obe_* tables.
- This implementation intentionally avoids all obe_* tables and derives
  everything from Academic 2.1 mark-entry tables (acv2_student_mark + related).

One row per student × course (section/course_code scope).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import connection
import os
from django.conf import settings


V2_CLASS_TYPES: dict[str, list[str]] = {
    "theory": ["THEORY", "PRBL", "THEORY_PMBL"],
    "tcpr-tcpl": ["TCPR", "TCPL"],
    "project-lab": ["PROJECT", "LAB"],
    "pure-lab": ["PURE_LAB"],
    "special": ["SPECIAL"],
}


@dataclass
class V2QueryResult:
    columns: list[str]
    rows: list[dict[str, Any]]
    total: int


def _parse_int(val: Any, default: int, cap: int) -> int:
    try:
        n = int(val)
    except Exception:
        return default
    return max(1, min(n, cap))


def _parse_float(val: Any, default: float, lo: float, hi: float) -> float:
    try:
        n = float(val)
    except Exception:
        return default
    return max(lo, min(n, hi))


def _filters(filters: dict[str, Any]) -> dict[str, str | None]:
    def norm(v: Any) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    return {
        "year": norm(filters.get("year")),
        "course_id": norm(filters.get("course_id")),
        "sem": norm(filters.get("sem")),
        "dept": norm(filters.get("dept")),
        "section": norm(filters.get("section") or filters.get("sec")),
        "course_code": norm(filters.get("course_code")),
    }


def _build_where(*, class_types: list[str], filters: dict[str, Any]) -> tuple[str, list[Any]]:
    f = _filters(filters)
    clauses: list[str] = [
        "acvsm.student_id IS NOT NULL",
        "UPPER(COALESCE(ct.name, ac.class_type_name, '')) = ANY(%s)",
    ]
    params: list[Any] = [class_types]

    # NOTE: Academic year is not directly linked in current schema (academics_semester has only id, number)
    # so `year` is accepted but ignored.

    if f["sem"]:
        clauses.append("CAST(sem.number AS TEXT) = %s")
        params.append(f["sem"])

    if f["course_id"]:
        clauses.append("CAST(ac.id AS TEXT) = %s")
        params.append(f["course_id"])

    if f["dept"]:
        # Match department by code (preferred), allow name match as fallback.
        clauses.append("(d.code ILIKE %s OR d.name ILIKE %s)")
        params.extend([f["dept"], f["dept"]])

    if f["section"]:
        clauses.append("sec.section_name ILIKE %s")
        params.append(f["section"])

    if f["course_code"]:
        clauses.append("ac.subject_code ILIKE %s")
        params.append(f["course_code"])

    return " WHERE " + " AND ".join(clauses), params


def query_v2_marks(
    *,
    format_key: str,
    filters: dict[str, Any],
    page: Any = None,
    page_size: Any = None,
) -> V2QueryResult:
    """v2 marks endpoint backed by Academic 2.1 (acv2_*) tables only."""

    class_types = V2_CLASS_TYPES.get(format_key)
    if not class_types:
        raise ValueError(f"Unknown v2 format key: {format_key!r}")

    pg = _parse_int(page, default=1, cap=100_000)
    psz = _parse_int(page_size, default=500, cap=20_000)
    offset = (pg - 1) * psz

    where_sql, where_params = _build_where(class_types=class_types, filters=filters)

    from_sql = """
        FROM acv2_student_mark acvsm
        JOIN acv2_exam_assignment ea ON acvsm.exam_assignment_id = ea.id
        JOIN acv2_section sec ON ea.section_id = sec.id
        JOIN acv2_course ac ON sec.course_id = ac.id
        LEFT JOIN acv2_class_type ct ON ac.class_type_id = ct.id
        LEFT JOIN academics_subject subj ON ac.subject_id = subj.id
        LEFT JOIN academics_course crs ON subj.course_id = crs.id
        LEFT JOIN academics_department d ON crs.department_id = d.id
        LEFT JOIN academics_semester sem ON ac.semester_id = sem.id
        LEFT JOIN accounts_user staff_u ON sec.faculty_user_id = staff_u.id
    """

    select_sql = """
        SELECT
            'N/A'::text AS year,
            COALESCE(sem.number::text, '1') AS sem,
            COALESCE(d.code, 'DEPT')::text AS dept,
            COALESCE(sec.section_name, 'SEC')::text AS section,
            acvsm.reg_no AS reg_no,
            acvsm.student_name AS student_name,
            UPPER(COALESCE(ct.name, ac.class_type_name, '')) AS course_type,
            COALESCE(ac.subject_code, '')::text AS course_code,
            'CORE'::text AS course_category,
            COALESCE(ac.subject_name, '')::text AS course_name,
            TRIM(CONCAT(COALESCE(staff_u.first_name, ''), ' ', COALESCE(staff_u.last_name, ''))) AS course_staff_name,
            NULL::text AS mentor_name,
            NULL::numeric AS attendance_percentage,
            MAX(CASE WHEN LOWER(COALESCE(ea.qp_type, ea.exam)) LIKE '%%ssa%%' AND ea.exam ILIKE '%%1%%' THEN acvsm.total_mark ELSE NULL END) AS ssa1,
            MAX(CASE WHEN LOWER(COALESCE(ea.qp_type, ea.exam)) LIKE '%%ssa%%' AND ea.exam ILIKE '%%2%%' THEN acvsm.total_mark ELSE NULL END) AS ssa2,
            MAX(CASE WHEN LOWER(COALESCE(ea.qp_type, ea.exam)) LIKE '%%cia%%' AND ea.exam ILIKE '%%1%%' THEN acvsm.total_mark ELSE NULL END) AS cia1,
            MAX(CASE WHEN LOWER(COALESCE(ea.qp_type, ea.exam)) LIKE '%%cia%%' AND ea.exam ILIKE '%%2%%' THEN acvsm.total_mark ELSE NULL END) AS cia2,
            MAX(CASE WHEN LOWER(COALESCE(ea.qp_type, ea.exam)) LIKE '%%model%%' THEN acvsm.total_mark ELSE NULL END) AS model_exam,
            ROUND(SUM(COALESCE(acvsm.weighted_mark, 0)), 2) AS internal_mark,
            ROUND(SUM(COALESCE(acvsm.co1_mark, 0)), 2) AS co1,
            ROUND(SUM(COALESCE(acvsm.co2_mark, 0)), 2) AS co2,
            ROUND(SUM(COALESCE(acvsm.co3_mark, 0)), 2) AS co3,
            ROUND(SUM(COALESCE(acvsm.co4_mark, 0)), 2) AS co4,
            ROUND(SUM(COALESCE(acvsm.co5_mark, 0)), 2) AS co5
    """

    group_order_sql = """
        GROUP BY
            sem.number,
            d.code,
            sec.section_name,
            acvsm.reg_no,
            acvsm.student_name,
            ct.name,
            ac.class_type_name,
            ac.subject_code,
            ac.subject_name,
            staff_u.first_name,
            staff_u.last_name
        ORDER BY
            COALESCE(d.code, 'DEPT'),
            COALESCE(sec.section_name, 'SEC'),
            COALESCE(ac.subject_code, ''),
            acvsm.reg_no
    """

    count_sql = (
        "SELECT COUNT(*) FROM ("
        "SELECT 1 "
        + from_sql
        + where_sql
        + group_order_sql.replace("ORDER BY\n            COALESCE(d.code, 'DEPT'),\n            COALESCE(sec.section_name, 'SEC'),\n            COALESCE(ac.subject_code, ''),\n            acvsm.reg_no", "")
        + ") t"
    )

    data_sql = (
        select_sql
        + from_sql
        + where_sql
        + group_order_sql
        + " LIMIT %s OFFSET %s"
    )

    with connection.cursor() as cursor:
        cursor.execute(count_sql, where_params)
        total = int((cursor.fetchone() or [0])[0] or 0)

        cursor.execute(data_sql, [*where_params, psz, offset])
        desc = cursor.description or []
        columns = [d.name for d in desc]
        rows_raw = cursor.fetchall()

    rows: list[dict[str, Any]] = [dict(zip(columns, row)) for row in rows_raw]
    # Build full photo URLs so callers (Power Query / Power BI) get ready-to-use links.
    # Prefer a configured environment var `VITE_API_BASE` or Django setting, fallback to idcs.zynix.us.
    site_root = str(getattr(settings, 'VITE_API_BASE', '') or os.getenv('VITE_API_BASE') or 'https://idcs.zynix.us').rstrip('/')
    # Append URL columns to columns list if not already present
    if 'student_photo_url' not in columns:
        columns.append('student_photo_url')
    if 'faculty_photo_url' not in columns:
        columns.append('faculty_photo_url')

    for r in rows:
        spath = (r.get('student_profile_path') or '')
        if spath and str(spath).strip():
            r['student_photo_url'] = f"{site_root}/media/{str(spath).lstrip('/')}"
        else:
            r['student_photo_url'] = None

        fpath = (r.get('faculty_profile_path') or '')
        if fpath and str(fpath).strip():
            r['faculty_photo_url'] = f"{site_root}/media/{str(fpath).lstrip('/')}"
        else:
            r['faculty_photo_url'] = None
    return V2QueryResult(columns=columns, rows=rows, total=total)


def query_v2_course_dashboard(
    *,
    filters: dict[str, Any],
    page: Any = None,
    page_size: Any = None,
    pass_percent: Any = None,
) -> V2QueryResult:
    """Power BI-friendly course dashboard fact table from Academic 2.1.

    Grain: one row per student x exam assignment, with joined section/course and
    final internal-mark totals.
    """

    pg = _parse_int(page, default=1, cap=100_000)
    psz = _parse_int(page_size, default=500, cap=20_000)
    pct = _parse_float(pass_percent, default=50.0, lo=0.0, hi=100.0)
    offset = (pg - 1) * psz

    f = _filters(filters)
    qp_type = (str(filters.get('qp_type') or '').strip() or None)
    faculty_user_id = (str(filters.get('faculty_user_id') or '').strip() or None)
    course_type = (str(filters.get('course_type') or '').strip() or None)
    exam = (str(filters.get('exam') or '').strip() or None)

    clauses: list[str] = [
        'acvsm.student_id IS NOT NULL',
    ]
    params: list[Any] = []

    if f['sem']:
        clauses.append('CAST(sem.number AS TEXT) = %s')
        params.append(f['sem'])

    if f.get('course_id'):
        clauses.append('CAST(ac.id AS TEXT) = %s')
        params.append(f['course_id'])

    if f['dept']:
        clauses.append('(d.code ILIKE %s OR d.name ILIKE %s)')
        params.extend([f['dept'], f['dept']])

    if f['section']:
        clauses.append('sec.section_name ILIKE %s')
        params.append(f['section'])

    if f['course_code']:
        clauses.append('ac.subject_code ILIKE %s')
        params.append(f['course_code'])

    if qp_type:
        clauses.append("COALESCE(ea.qp_type, '') ILIKE %s")
        params.append(qp_type)

    if faculty_user_id:
        clauses.append('CAST(sec.faculty_user_id AS TEXT) = %s')
        params.append(faculty_user_id)

    if course_type:
        clauses.append("UPPER(COALESCE(ct.name, ac.class_type_name, '')) = UPPER(%s)")
        params.append(course_type)

    if exam:
        clauses.append('(ea.exam ILIKE %s OR ea.exam_display_name ILIKE %s)')
        params.extend([exam, exam])

    where_sql = ' WHERE ' + ' AND '.join(clauses)

    from_sql = """
        FROM acv2_student_mark acvsm
        JOIN acv2_exam_assignment ea ON acvsm.exam_assignment_id = ea.id
        JOIN acv2_section sec ON ea.section_id = sec.id
        JOIN acv2_course ac ON sec.course_id = ac.id
        LEFT JOIN acv2_class_type ct ON ac.class_type_id = ct.id
        LEFT JOIN academics_semester sem ON ac.semester_id = sem.id
        LEFT JOIN accounts_user staff_u ON sec.faculty_user_id = staff_u.id
        LEFT JOIN academics_staffprofile staff_p ON staff_p.user_id = sec.faculty_user_id
        LEFT JOIN academics_department d ON staff_p.department_id = d.id
        LEFT JOIN acv2_internal_mark aim
            ON aim.section_id = sec.id
           AND aim.student_id = acvsm.student_id
        LEFT JOIN LATERAL (
            SELECT (elem->>'pass_mark')::int AS pass_mark
            FROM jsonb_array_elements(COALESCE(ct.exam_assignments, '[]'::jsonb)) AS elem
            WHERE UPPER(TRIM(elem->>'qp_type')) = UPPER(TRIM(COALESCE(ea.qp_type, '')))
              AND LOWER(TRIM(COALESCE(elem->>'exam_display_name', elem->>'exam', '')))
                   = LOWER(TRIM(COALESCE(ea.exam_display_name, ea.exam, '')))
              AND elem->>'pass_mark' IS NOT NULL
            LIMIT 1
        ) ea_pm ON true
        LEFT JOIN academics_studentprofile student_p ON acvsm.student_id = student_p.id
    """

    select_sql = """
        SELECT
            'N/A'::text AS year,
            COALESCE(sem.number::text, '1') AS sem,
            COALESCE(d.code, '')::text AS dept_code,
            COALESCE(d.name, '')::text AS dept_name,
            CAST(sec.id AS text) AS section_id,
            COALESCE(sec.section_name, '')::text AS section,
            CAST(ac.id AS text) AS course_id,
            COALESCE(ac.subject_code, '')::text AS course_code,
            COALESCE(ac.subject_name, '')::text AS course_name,
            UPPER(COALESCE(ct.name, ac.class_type_name, '')) AS course_type,
            COALESCE(ea.qp_type, '')::text AS qp_type,
            CAST(sec.faculty_user_id AS text) AS faculty_user_id,
            TRIM(CONCAT(COALESCE(staff_u.first_name, ''), ' ', COALESCE(staff_u.last_name, ''))) AS faculty_name,
            CAST(ea.id AS text) AS exam_assignment_id,
            COALESCE(ea.exam, '')::text AS exam_code,
            COALESCE(NULLIF(ea.exam_display_name, ''), ea.exam, '')::text AS exam_name,
            COALESCE(ea.status, 'DRAFT')::text AS exam_status,
            ea.published_at AS published_at,
            CAST(acvsm.student_id AS text) AS student_id,
            acvsm.reg_no AS reg_no,
            acvsm.student_name AS student_name,
            COALESCE(student_p.profile_image::text, '') AS student_profile_path,
            COALESCE(staff_p.profile_image::text, '') AS faculty_profile_path,
            acvsm.is_absent AS is_absent,
            acvsm.is_exempted AS is_exempted,
            COALESCE(acvsm.remarks, '')::text AS remarks,
            ea.max_marks AS exam_max_marks,
            ea.weight AS exam_weight,
            ROUND(COALESCE(acvsm.co1_mark, 0) + COALESCE(acvsm.co2_mark, 0) + COALESCE(acvsm.co3_mark, 0) + COALESCE(acvsm.co4_mark, 0) + COALESCE(acvsm.co5_mark, 0), 2) AS exam_total_mark,
            acvsm.weighted_mark AS exam_weighted_mark,
            acvsm.co1_mark AS exam_co1_mark,
            acvsm.co2_mark AS exam_co2_mark,
            acvsm.co3_mark AS exam_co3_mark,
            acvsm.co4_mark AS exam_co4_mark,
            acvsm.co5_mark AS exam_co5_mark,
            aim.co1_total AS internal_co1_total,
            aim.co2_total AS internal_co2_total,
            aim.co3_total AS internal_co3_total,
            aim.co4_total AS internal_co4_total,
            aim.co5_total AS internal_co5_total,
            aim.final_mark AS internal_final_mark,
            aim.max_mark AS internal_max_mark,
            ea_pm.pass_mark AS pass_mark,
            CASE
                WHEN ea_pm.pass_mark IS NULL THEN NULL
                WHEN (COALESCE(acvsm.co1_mark, 0) + COALESCE(acvsm.co2_mark, 0) + COALESCE(acvsm.co3_mark, 0) + COALESCE(acvsm.co4_mark, 0) + COALESCE(acvsm.co5_mark, 0)) >= ea_pm.pass_mark THEN TRUE
                ELSE FALSE
            END AS is_pass
    """

    order_sql = """
        ORDER BY
            COALESCE(ac.subject_code, ''),
            COALESCE(sec.section_name, ''),
            acvsm.reg_no,
            COALESCE(ea.exam_display_name, ea.exam, ''),
            ea.created_at
    """

    count_sql = 'SELECT COUNT(*) ' + from_sql + where_sql
    data_sql = select_sql + from_sql + where_sql + order_sql + ' LIMIT %s OFFSET %s'

    with connection.cursor() as cursor:
        cursor.execute(count_sql, params)
        total = int((cursor.fetchone() or [0])[0] or 0)

        cursor.execute(data_sql, [*params, psz, offset])
        desc = cursor.description or []
        columns = [d.name for d in desc]
        rows_raw = cursor.fetchall()

    rows: list[dict[str, Any]] = [dict(zip(columns, row)) for row in rows_raw]
    # Build full photo URLs using configured base (env `VITE_API_BASE` or Django setting),
    # fallback to https://idcs.zynix.us so clients get ready-to-use HTTPS links.
    site_root = str(getattr(settings, 'VITE_API_BASE', '') or os.getenv('VITE_API_BASE') or 'https://idcs.zynix.us').rstrip('/')
    if 'student_photo_url' not in columns:
        columns.append('student_photo_url')
    if 'faculty_photo_url' not in columns:
        columns.append('faculty_photo_url')

    for r in rows:
        spath = (r.get('student_profile_path') or '')
        if spath and str(spath).strip():
            r['student_photo_url'] = f"{site_root}/media/{str(spath).lstrip('/')}"
        else:
            r['student_photo_url'] = None

        fpath = (r.get('faculty_profile_path') or '')
        if fpath and str(fpath).strip():
            r['faculty_photo_url'] = f"{site_root}/media/{str(fpath).lstrip('/')}"
        else:
            r['faculty_photo_url'] = None

    return V2QueryResult(columns=columns, rows=rows, total=total)
