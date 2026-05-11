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


def _filters(filters: dict[str, Any]) -> dict[str, str | None]:
    def norm(v: Any) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    return {
        "year": norm(filters.get("year")),
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
    return V2QueryResult(columns=columns, rows=rows, total=total)
