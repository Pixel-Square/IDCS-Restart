from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import connection


VIEW_MAP: dict[str, str] = {
    'theory': 'reporting.vw_marks_theory',
    'tcpr-tcpl': 'reporting.vw_marks_tcpr_tcpl',
    'project-lab': 'reporting.vw_marks_project_lab',
}

ALLOWED_FILTERS: dict[str, str] = {
    'year': '"year"',
    'sem': '"sem"',
    'dept': '"dept"',
    'sec': '"sec"',
    'course_type': '"course type"',
    'course_code': '"course code"',
    'course_category': '"course category"',
}


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[dict[str, Any]]
    total: int


def _build_where(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    for key, col in ALLOWED_FILTERS.items():
        val = filters.get(key)
        if val is None:
            continue
        txt = str(val).strip()
        if txt == '':
            continue
        clauses.append(f"{col} = %s")
        params.append(txt)

    if not clauses:
        return '', []

    return ' WHERE ' + ' AND '.join(clauses), params


def _parse_positive_int(value: Any, default: int, cap: int) -> int:
    try:
        n = int(value)
    except Exception:
        return default
    if n < 1:
        return default
    return min(n, cap)


def query_reporting_view(
    *,
    format_key: str,
    filters: dict[str, Any],
    page: int | None = None,
    page_size: int | None = None,
) -> QueryResult:
    view_name = VIEW_MAP.get(format_key)
    if not view_name:
        raise ValueError('Invalid format key')

    where_sql, where_params = _build_where(filters)

    pg = _parse_positive_int(page, default=1, cap=100000)
    psz = _parse_positive_int(page_size, default=500, cap=200000)
    offset = (pg - 1) * psz

    count_sql = f"SELECT COUNT(*) FROM {view_name}{where_sql}"
    data_sql = (
        f"SELECT * FROM {view_name}{where_sql} "
        'ORDER BY "year", "sem", "dept", "sec", "course code", "name" '
        'LIMIT %s OFFSET %s'
    )

    with connection.cursor() as cursor:
        cursor.execute(count_sql, where_params)
        total = int((cursor.fetchone() or [0])[0] or 0)

        cursor.execute(data_sql, [*where_params, psz, offset])
        desc = cursor.description or []
        columns = [d.name for d in desc]
        rows_raw = cursor.fetchall()

    rows: list[dict[str, Any]] = [dict(zip(columns, row)) for row in rows_raw]
    return QueryResult(columns=columns, rows=rows, total=total)
