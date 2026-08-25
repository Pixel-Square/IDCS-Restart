from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.apps import apps
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

FORMAT_DEFAULT_COURSE_TYPE: dict[str, str] = {
    'theory': 'THEORY',
    'tcpr-tcpl': 'TCPR/TCPL',
    'project-lab': '',
}

FORMAT_ALLOWED_TYPES: dict[str, set[str]] = {
    'theory': {'THEORY', 'THEORY (PMBL)', 'THEORY_PMBL', 'PRBL'},
    'tcpr-tcpl': {'TCPR', 'TCPL', 'TCPR/TCPL', 'TCPR-TCPL'},
    # Format 3 should only contain project/lab class types.
    'project-lab': {'PROJECT', 'LAB'},
}


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[dict[str, Any]]
    total: int


def _canon_type(value: Any) -> str:
    return str(value or '').strip().upper()


def _apply_format_course_type_rules(
    *, format_key: str, columns: list[str], rows: list[dict[str, Any]]
) -> tuple[list[str], list[dict[str, Any]]]:
    type_col = next((c for c in columns if str(c).strip().lower() == 'course type'), None)
    if not type_col:
        return columns, rows

    allowed = FORMAT_ALLOWED_TYPES.get(format_key, set())
    default_type = FORMAT_DEFAULT_COURSE_TYPE.get(format_key, '')

    out_rows: list[dict[str, Any]] = []
    for row in rows:
        next_row = dict(row)
        raw_type = next_row.get(type_col)
        canon = _canon_type(raw_type)

        if format_key == 'project-lab':
            # Preserve exact BI-facing type labels while translating known aliases.
            if canon in {'TCPL', 'TCPR', 'LAB', 'LABORATORY', 'PRACTICAL'}:
                canon = 'LAB'
                next_row[type_col] = 'LAB'
            elif canon in {'PROJECT', 'PROJECT-LAB', 'PROJECT LAB', 'PROJECT/LAB'}:
                canon = 'PROJECT'
                next_row[type_col] = 'PROJECT'

        # Fill missing course type for BI consistency.
        if not canon and default_type:
            canon = default_type
            next_row[type_col] = default_type

        # Keep only rows that belong to this format.
        if allowed and canon and canon not in allowed:
            continue

        out_rows.append(next_row)

    return columns, out_rows


def _enrich_project_lab_metadata(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fill missing/placeholder metadata for project-lab rows.

    Some rows in reporting.vw_marks_project_lab have:
    - empty course type/category
    - course name equal to course code (placeholder)

    We backfill from reporting.vw_pbi_student_subject_base by course_code.
    """
    if not rows:
        return rows

    needed_codes: set[str] = set()
    for row in rows:
        code = str(row.get('course code') or '').strip()
        if not code:
            continue
        name = str(row.get('course name') or '').strip()
        ctype = str(row.get('course type') or '').strip()
        ccat = str(row.get('course category') or '').strip()
        if not name or name.upper() == code.upper() or not ctype or not ccat:
            needed_codes.add(code)

    if not needed_codes:
        return rows

    placeholders = ', '.join(['%s'] * len(needed_codes))
    meta_by_code: dict[str, dict[str, str]] = {}
    with connection.cursor() as cursor:
        # Prefer canonical curriculum/elective definitions for name/type/category.
        cursor.execute(
            'SELECT UPPER(course_code), '
            "MAX(NULLIF(TRIM(course_name), '')) AS course_name, "
            "MAX(NULLIF(TRIM(class_type), '')) AS class_type, "
            "MAX(NULLIF(TRIM(category), '')) AS category, "
            'MAX(s.number)::text AS sem_no '
            'FROM curriculum_curriculumdepartment '
            'LEFT JOIN academics_semester s ON s.id = curriculum_curriculumdepartment.semester_id '
            f'WHERE UPPER(course_code) IN ({placeholders}) '
            'GROUP BY UPPER(course_code)',
            list(needed_codes),
        )
        for code, name, ctype, cat, sem_no in cursor.fetchall():
            key = str(code or '').strip().upper()
            if key:
                meta_by_code[key] = {
                    'course name': str(name or '').strip(),
                    'course type': str(ctype or '').strip(),
                    'course category': str(cat or '').strip(),
                    'sem': str(sem_no or '').strip(),
                }

        cursor.execute(
            'SELECT UPPER(course_code), '
            "MAX(NULLIF(TRIM(course_name), '')) AS course_name, "
            "MAX(NULLIF(TRIM(class_type), '')) AS class_type, "
            "MAX(NULLIF(TRIM(category), '')) AS category, "
            'MAX(s.number)::text AS sem_no '
            'FROM curriculum_electivesubject '
            'LEFT JOIN academics_semester s ON s.id = curriculum_electivesubject.semester_id '
            f'WHERE UPPER(course_code) IN ({placeholders}) '
            'GROUP BY UPPER(course_code)',
            list(needed_codes),
        )
        for code, name, ctype, cat, sem_no in cursor.fetchall():
            key = str(code or '').strip().upper()
            if not key:
                continue
            existing = meta_by_code.get(key, {})
            meta_by_code[key] = {
                'course name': str(name or '').strip() or existing.get('course name', ''),
                'course type': str(ctype or '').strip() or existing.get('course type', ''),
                'course category': str(cat or '').strip() or existing.get('course category', ''),
                'sem': str(sem_no or '').strip() or existing.get('sem', ''),
            }

    out_rows: list[dict[str, Any]] = []
    for row in rows:
        next_row = dict(row)
        code = str(next_row.get('course code') or '').strip().upper()
        meta = meta_by_code.get(code)
        if meta:
            existing_name = str(next_row.get('course name') or '').strip()
            existing_type = str(next_row.get('course type') or '').strip()
            existing_cat = str(next_row.get('course category') or '').strip()

            if (not existing_name or existing_name.upper() == code) and meta.get('course name'):
                next_row['course name'] = meta['course name']
            if (not existing_type or existing_type.upper() == 'PROJECT/LAB') and meta.get('course type'):
                next_row['course type'] = meta['course type']
            if not existing_cat and meta.get('course category'):
                next_row['course category'] = meta['course category']
            # Fix sem source drift for electives where subject master sem is stale.
            # Curriculum/elective sem number is the expected reporting semester.
            meta_sem = str(meta.get('sem') or '').strip()
            if meta_sem:
                next_row['sem'] = meta_sem

        out_rows.append(next_row)

    return out_rows


def _row_matches_filters(row: dict[str, Any], filters: dict[str, Any]) -> bool:
    key_to_col = {
        'year': 'year',
        'sem': 'sem',
        'dept': 'dept',
        'sec': 'sec',
        'course_type': 'course type',
        'course_code': 'course code',
        'course_category': 'course category',
    }
    for key, col in key_to_col.items():
        val = filters.get(key)
        if val is None:
            continue
        txt = str(val).strip()
        if txt == '':
            continue
        if str(row.get(col, '')).strip() != txt:
            return False
    return True


def _inject_missing_project_rows_from_final_internal(
    *, columns: list[str], rows: list[dict[str, Any]], filters: dict[str, Any]
) -> list[dict[str, Any]]:
    """Add PROJECT rows backed by final internal marks when source view misses them.

    Some PROJECT subjects have marks only in `obe_final_internal_mark` and don't
    appear in reporting.vw_marks_project_lab because the base union uses other
    assessment tables. This keeps format 3 complete for those subjects.
    """
    existing_keys: set[tuple[str, str]] = set()
    existing_codes: set[str] = set()
    for row in rows:
        reg = str(row.get('reg no (last 12 digit)') or '').strip().upper()
        code = str(row.get('course code') or '').strip().upper()
        if reg and code:
            existing_keys.add((reg, code))
            existing_codes.add(code)

    with connection.cursor() as cursor:
        cursor.execute(
            """
SELECT DISTINCT UPPER(course_code) AS code
FROM curriculum_curriculumdepartment
WHERE UPPER(TRIM(COALESCE(class_type, ''))) = 'PROJECT'
UNION
SELECT DISTINCT UPPER(course_code) AS code
FROM curriculum_electivesubject
WHERE UPPER(TRIM(COALESCE(class_type, ''))) = 'PROJECT'
            """
        )
        project_codes = {str(r[0] or '').strip().upper() for r in cursor.fetchall() if str(r[0] or '').strip()}

    target_codes = sorted(project_codes - existing_codes)
    if not target_codes:
        return rows

    req_code = str(filters.get('course_code') or '').strip().upper()
    if req_code:
        if req_code not in target_codes:
            return rows
        target_codes = [req_code]

    placeholders = ', '.join(['%s'] * len(target_codes))

    injected: list[dict[str, Any]] = []
    with connection.cursor() as cursor:
        cursor.execute(
            f'''
SELECT
  COALESCE(NULLIF(sp.batch::text, ''), '') AS year,
  COALESCE(meta.sem_no::text, sem_subj.number::text, '') AS sem,
  COALESCE(
    NULLIF(dept_batch_course.short_name::text, ''),
    NULLIF(dept_home.short_name::text, ''),
    NULLIF(dept_sec.short_name::text, ''),
    NULLIF(dept_batch.short_name::text, ''),
    NULLIF(dept_batch_course.code::text, ''),
    NULLIF(dept_home.code::text, ''),
    NULLIF(dept_sec.code::text, ''),
    NULLIF(dept_batch.code::text, ''),
    dept_batch_course.name::text,
    dept_home.name::text,
    dept_sec.name::text,
    dept_batch.name::text,
    NULLIF(dept.short_name::text, ''),
    NULLIF(dept.code::text, ''),
    dept.name::text,
    ''
  ) AS dept,
  COALESCE(NULLIF(sec.name::text, ''), '') AS sec,
  RIGHT(regexp_replace(COALESCE(sp.reg_no, '')::text, '\\D', '', 'g'), 12) AS reg_last12,
  COALESCE(
    NULLIF(TRIM(BOTH FROM CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
    NULLIF(TRIM(BOTH FROM COALESCE(u.username, '')), ''),
    NULLIF(split_part(COALESCE(u.email, '')::text, '@', 1), ''),
    NULLIF(RIGHT(regexp_replace(COALESCE(sp.reg_no, '')::text, '\\D', '', 'g'), 12), ''),
    ''
  ) AS student_name,
  UPPER(COALESCE(subj.code, '')) AS course_code,
  COALESCE(NULLIF(TRIM(meta.class_type), ''), '') AS class_type,
  COALESCE(NULLIF(TRIM(meta.category), ''), '') AS category,
  COALESCE(NULLIF(TRIM(meta.course_name), ''), COALESCE(subj.name, '')) AS course_name,
  COALESCE(fim.final_mark, 0)::numeric AS final_mark
FROM obe_final_internal_mark fim
JOIN academics_subject subj ON subj.id = fim.subject_id
JOIN academics_studentprofile sp ON sp.id = fim.student_id
LEFT JOIN accounts_user u ON u.id = sp.user_id
LEFT JOIN academics_semester sem_subj ON sem_subj.id = subj.semester_id
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
  SELECT x.class_type, x.category, x.course_name, x.sem_no
  FROM (
    SELECT
      NULLIF(TRIM(cd.class_type), '') AS class_type,
      NULLIF(TRIM(cd.category), '') AS category,
      NULLIF(TRIM(cd.course_name), '') AS course_name,
      s.number::int AS sem_no,
      1 AS src_order,
      cd.id AS rid
    FROM curriculum_curriculumdepartment cd
    LEFT JOIN academics_semester s ON s.id = cd.semester_id
    WHERE UPPER(TRIM(COALESCE(cd.course_code, ''))) = UPPER(TRIM(COALESCE(subj.code, '')))

    UNION ALL

    SELECT
      NULLIF(TRIM(es.class_type), '') AS class_type,
      NULLIF(TRIM(es.category), '') AS category,
      NULLIF(TRIM(es.course_name), '') AS course_name,
      s.number::int AS sem_no,
      2 AS src_order,
      es.id AS rid
    FROM curriculum_electivesubject es
    LEFT JOIN academics_semester s ON s.id = es.semester_id
    WHERE UPPER(TRIM(COALESCE(es.course_code, ''))) = UPPER(TRIM(COALESCE(subj.code, '')))
  ) x
  ORDER BY
    CASE WHEN UPPER(COALESCE(x.class_type, '')) = 'PROJECT' THEN 0 ELSE 1 END,
    x.src_order,
    x.rid DESC
  LIMIT 1
) meta ON true
WHERE UPPER(COALESCE(meta.class_type, '')) = 'PROJECT'
    AND UPPER(COALESCE(subj.code, '')) IN ({placeholders})
                        ''',
                        target_codes,
        )
        candidates = cursor.fetchall()

    for (
        year,
        sem,
        dept,
        sec,
        reg_last12,
        student_name,
        course_code,
        class_type,
        category,
        course_name,
        final_mark,
    ) in candidates:
        key = (str(reg_last12 or '').strip().upper(), str(course_code or '').strip().upper())
        if not key[0] or not key[1] or key in existing_keys:
            continue

        row: dict[str, Any] = {col: None for col in columns}
        row['year'] = str(year or '')
        row['sem'] = str(sem or '')
        row['dept'] = str(dept or '')
        row['sec'] = str(sec or '')
        row['reg no (last 12 digit)'] = str(reg_last12 or '')
        row['name'] = str(student_name or '')
        row['course type'] = str(class_type or '')
        row['course code'] = str(course_code or '')
        row['course category'] = str(category or '')
        row['course name'] = str(course_name or '')

        # Keep unavailable component marks blank and expose final score only.
        for k in (
            'c1-co1', 'c1-co2', 'c1-co3', 'c1-co4', 'c1-co5',
            'c2-co1', 'c2-co2', 'c2-co3', 'c2-co4', 'c2-co5',
            'Model-co1', 'Model-co2', 'Model-co3', 'Model-co4', 'Model-co5',
        ):
            if k in row:
                row[k] = None

        fm = final_mark if final_mark is not None else None
        for k in ('c1-cia1', 'c1-Internal', 'c2-cia2', 'c2-Internal', 'Model', 'Model-Internal'):
            if k in row:
                row[k] = None
        if 'before cqi' in row:
            row['before cqi'] = fm
        if 'after cqi' in row:
            row['after cqi'] = fm
        if 'Internal' in row:
            row['Internal'] = fm

        if not _row_matches_filters(row, filters):
            continue

        existing_keys.add(key)
        injected.append(row)

    if not injected:
        return rows
    return rows + injected


def _inject_missing_theory_rows_from_final_internal(
    *, columns: list[str], rows: list[dict[str, Any]], filters: dict[str, Any]
) -> list[dict[str, Any]]:
    """Add THEORY/PMBL/PRBL rows backed by final internal marks when missing.

    Theory view can miss subjects when source mark unions are incomplete even
    though final internal rows exist. This fallback keeps theory format complete
    across semesters.
    """
    existing_keys: set[tuple[str, str]] = set()
    existing_codes: set[str] = set()
    for row in rows:
        reg = str(row.get('reg no (last 12 digit)') or '').strip().upper()
        code = str(row.get('course code') or '').strip().upper()
        if reg and code:
            existing_keys.add((reg, code))
            existing_codes.add(code)

    with connection.cursor() as cursor:
        cursor.execute(
            """
SELECT DISTINCT UPPER(course_code) AS code
FROM curriculum_curriculumdepartment
WHERE UPPER(TRIM(COALESCE(class_type, ''))) IN ('THEORY', 'THEORY_PMBL', 'THEORY (PMBL)', 'PRBL')
UNION
SELECT DISTINCT UPPER(course_code) AS code
FROM curriculum_electivesubject
WHERE UPPER(TRIM(COALESCE(class_type, ''))) IN ('THEORY', 'THEORY_PMBL', 'THEORY (PMBL)', 'PRBL')
            """
        )
        theory_codes = {str(r[0] or '').strip().upper() for r in cursor.fetchall() if str(r[0] or '').strip()}

    target_codes = sorted(theory_codes - existing_codes)
    if not target_codes:
        return rows

    req_code = str(filters.get('course_code') or '').strip().upper()
    if req_code:
        if req_code not in target_codes:
            return rows
        target_codes = [req_code]

    placeholders = ', '.join(['%s'] * len(target_codes))

    injected: list[dict[str, Any]] = []
    with connection.cursor() as cursor:
        cursor.execute(
            f'''
SELECT
  COALESCE(NULLIF(sp.batch::text, ''), '') AS year,
  COALESCE(meta.sem_no::text, sem_subj.number::text, '') AS sem,
  COALESCE(
    NULLIF(dept_batch_course.short_name::text, ''),
    NULLIF(dept_home.short_name::text, ''),
    NULLIF(dept_sec.short_name::text, ''),
    NULLIF(dept_batch.short_name::text, ''),
    NULLIF(dept_batch_course.code::text, ''),
    NULLIF(dept_home.code::text, ''),
    NULLIF(dept_sec.code::text, ''),
    NULLIF(dept_batch.code::text, ''),
    dept_batch_course.name::text,
    dept_home.name::text,
    dept_sec.name::text,
    dept_batch.name::text,
    NULLIF(dept.short_name::text, ''),
    NULLIF(dept.code::text, ''),
    dept.name::text,
    ''
  ) AS dept,
  COALESCE(NULLIF(sec.name::text, ''), '') AS sec,
  RIGHT(regexp_replace(COALESCE(sp.reg_no, '')::text, '\\D', '', 'g'), 12) AS reg_last12,
  COALESCE(
    NULLIF(TRIM(BOTH FROM CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
    NULLIF(TRIM(BOTH FROM COALESCE(u.username, '')), ''),
    NULLIF(split_part(COALESCE(u.email, '')::text, '@', 1), ''),
    NULLIF(RIGHT(regexp_replace(COALESCE(sp.reg_no, '')::text, '\\D', '', 'g'), 12), ''),
    ''
  ) AS student_name,
  UPPER(COALESCE(subj.code, '')) AS course_code,
  COALESCE(NULLIF(TRIM(meta.class_type), ''), '') AS class_type,
  COALESCE(NULLIF(TRIM(meta.category), ''), '') AS category,
  COALESCE(NULLIF(TRIM(meta.course_name), ''), COALESCE(subj.name, '')) AS course_name,
  COALESCE(fim.final_mark, 0)::numeric AS final_mark
FROM obe_final_internal_mark fim
JOIN academics_subject subj ON subj.id = fim.subject_id
JOIN academics_studentprofile sp ON sp.id = fim.student_id
LEFT JOIN accounts_user u ON u.id = sp.user_id
LEFT JOIN academics_semester sem_subj ON sem_subj.id = subj.semester_id
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
  SELECT x.class_type, x.category, x.course_name, x.sem_no
  FROM (
    SELECT
      NULLIF(TRIM(cd.class_type), '') AS class_type,
      NULLIF(TRIM(cd.category), '') AS category,
      NULLIF(TRIM(cd.course_name), '') AS course_name,
      s.number::int AS sem_no,
      1 AS src_order,
      cd.id AS rid
    FROM curriculum_curriculumdepartment cd
    LEFT JOIN academics_semester s ON s.id = cd.semester_id
    WHERE UPPER(TRIM(COALESCE(cd.course_code, ''))) = UPPER(TRIM(COALESCE(subj.code, '')))

    UNION ALL

    SELECT
      NULLIF(TRIM(es.class_type), '') AS class_type,
      NULLIF(TRIM(es.category), '') AS category,
      NULLIF(TRIM(es.course_name), '') AS course_name,
      s.number::int AS sem_no,
      2 AS src_order,
      es.id AS rid
    FROM curriculum_electivesubject es
    LEFT JOIN academics_semester s ON s.id = es.semester_id
    WHERE UPPER(TRIM(COALESCE(es.course_code, ''))) = UPPER(TRIM(COALESCE(subj.code, '')))
  ) x
  ORDER BY
    CASE WHEN UPPER(COALESCE(x.class_type, '')) IN ('THEORY', 'THEORY_PMBL', 'THEORY (PMBL)', 'PRBL') THEN 0 ELSE 1 END,
    x.src_order,
    x.rid DESC
  LIMIT 1
) meta ON true
WHERE UPPER(COALESCE(meta.class_type, '')) IN ('THEORY', 'THEORY_PMBL', 'THEORY (PMBL)', 'PRBL')
    AND UPPER(COALESCE(subj.code, '')) IN ({placeholders})
                        ''',
                        target_codes,
        )
        candidates = cursor.fetchall()

    for (
        year,
        sem,
        dept,
        sec,
        reg_last12,
        student_name,
        course_code,
        class_type,
        category,
        course_name,
        final_mark,
    ) in candidates:
        key = (str(reg_last12 or '').strip().upper(), str(course_code or '').strip().upper())
        if not key[0] or not key[1] or key in existing_keys:
            continue

        row: dict[str, Any] = {col: None for col in columns}
        row['year'] = str(year or '')
        row['sem'] = str(sem or '')
        row['dept'] = str(dept or '')
        row['sec'] = str(sec or '')
        row['reg no (last 12 digit)'] = str(reg_last12 or '')
        row['name'] = str(student_name or '')
        row['course type'] = str(class_type or '')
        row['course code'] = str(course_code or '')
        row['course category'] = str(category or '')
        row['course name'] = str(course_name or '')

        # Theory assessment breakdown is unavailable in this fallback path.
        for k in (
            'c1-ssa1-co1', 'c1-ssa1-co2', 'c1-ssa1',
            'c1-fa1-co1', 'c1-fa1-co2', 'c1-fa',
            'c1-cia1-co1', 'c1-cia1-co2', 'c1-cia1',
            'c2-ssa2-co3', 'c2-ssa2-co4', 'c2-ssa2',
            'c2-fa2-co3', 'c2-fa2-co4', 'c2-fa2',
            'c2-cia2-co3', 'c2-cia2-co4', 'c2-cia2',
            'Model-co1', 'Model-co2', 'Model-co3', 'Model-co4', 'Model-co5', 'Model',
        ):
            if k in row:
                row[k] = None

        fm = final_mark if final_mark is not None else None
        for k in ('c1-before cqi', 'c1-after cqi', 'c1-Internal', 'c2-before cqi', 'c2-after cqi', 'c2-Internal'):
            if k in row:
                row[k] = None
        if 'before cqi' in row:
            row['before cqi'] = fm
        if 'after cqi' in row:
            row['after cqi'] = fm
        if 'Internal' in row:
            row['Internal'] = fm

        if not _row_matches_filters(row, filters):
            continue

        existing_keys.add(key)
        injected.append(row)

    if not injected:
        return rows
    return rows + injected


def _apply_theory_entered_co_splits(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Use entered SSA CO splits from draft sheets and clear heuristic split columns.

    The theory SQL view splits SSA/Formative totals equally into CO columns.
    That heuristic can differ from entered CO-wise values in UI drafts.
    """
    if not rows:
        return rows

    needed_codes = {
        str(r.get('course code') or '').strip().upper()
        for r in rows
        if str(r.get('course code') or '').strip()
    }
    needed_regs = {
        str(r.get('reg no (last 12 digit)') or '').strip()
        for r in rows
        if str(r.get('reg no (last 12 digit)') or '').strip()
    }
    if not needed_codes or not needed_regs:
        return rows

    placeholders_codes = ', '.join(['%s'] * len(needed_codes))
    placeholders_regs = ', '.join(['%s'] * len(needed_regs))

    reg_to_sid: dict[str, int] = {}
    code_to_subject_ids: dict[str, list[int]] = {}
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
SELECT id, RIGHT(regexp_replace(COALESCE(reg_no, '')::text, '\\D', '', 'g'), 12) AS reg12
FROM academics_studentprofile
WHERE RIGHT(regexp_replace(COALESCE(reg_no, '')::text, '\\D', '', 'g'), 12) IN ({placeholders_regs})
            """,
            list(needed_regs),
        )
        for sid, reg12 in cursor.fetchall():
            reg = str(reg12 or '').strip()
            if reg and reg not in reg_to_sid:
                reg_to_sid[reg] = int(sid)

        cursor.execute(
            f"""
SELECT id, UPPER(code)
FROM academics_subject
WHERE UPPER(code) IN ({placeholders_codes})
            """,
            list(needed_codes),
        )
        for subj_id, code in cursor.fetchall():
            key = str(code or '').strip().upper()
            if key:
                code_to_subject_ids.setdefault(key, []).append(int(subj_id))

    if not reg_to_sid or not code_to_subject_ids:
        return rows

    subject_ids = [sid for ids in code_to_subject_ids.values() for sid in ids]
    AssessmentDraft = apps.get_model('OBE', 'AssessmentDraft')
    drafts = (
        AssessmentDraft.objects
        .filter(subject_id__in=subject_ids, assessment__in=['ssa1', 'ssa2'])
        .order_by('subject_id', 'assessment', '-updated_at')
    )

    # pick latest draft per subject+assessment
    latest_by_key: dict[tuple[int, str], Any] = {}
    for d in drafts:
        k = (int(d.subject_id), str(d.assessment))
        if k not in latest_by_key:
            latest_by_key[k] = d

    # Build map: (course_code, student_id, assessment) -> (coA, coB)
    split_map: dict[tuple[str, int, str], tuple[float | None, float | None]] = {}
    for code, subj_ids in code_to_subject_ids.items():
        for subj_id in subj_ids:
            for assessment, keys in (('ssa1', ('co1', 'co2')), ('ssa2', ('co3', 'co4'))):
                d = latest_by_key.get((subj_id, assessment))
                if not d or not isinstance(d.data, dict):
                    continue
                sheet = d.data.get('sheet', d.data)
                rows_data = sheet.get('rows', []) if isinstance(sheet, dict) else []
                for r in rows_data:
                    if not isinstance(r, dict):
                        continue
                    sid_txt = str(r.get('studentId', '')).strip()
                    if not sid_txt.isdigit():
                        continue
                    sid = int(sid_txt)
                    v1 = r.get(keys[0])
                    v2 = r.get(keys[1])
                    try:
                        vv1 = float(v1) if v1 not in ('', None) else None
                    except Exception:
                        vv1 = None
                    try:
                        vv2 = float(v2) if v2 not in ('', None) else None
                    except Exception:
                        vv2 = None
                    if vv1 is None and vv2 is None:
                        continue
                    split_map[(code, sid, assessment)] = (vv1, vv2)

    out_rows: list[dict[str, Any]] = []
    for row in rows:
        n = dict(row)
        code = str(n.get('course code') or '').strip().upper()
        reg12 = str(n.get('reg no (last 12 digit)') or '').strip()
        sid = reg_to_sid.get(reg12)

        if sid is None or not code:
            out_rows.append(n)
            continue

        ssa1 = split_map.get((code, sid, 'ssa1'))
        ssa2 = split_map.get((code, sid, 'ssa2'))

        if ssa1 and 'c1-ssa1-co1' in n:
            n['c1-ssa1-co1'] = ssa1[0] if ssa1 else None
        if ssa1 and 'c1-ssa1-co2' in n:
            n['c1-ssa1-co2'] = ssa1[1] if ssa1 else None
        if ssa2 and 'c2-ssa2-co3' in n:
            n['c2-ssa2-co3'] = ssa2[0] if ssa2 else None
        if ssa2 and 'c2-ssa2-co4' in n:
            n['c2-ssa2-co4'] = ssa2[1] if ssa2 else None

        out_rows.append(n)

    return out_rows


def _reshape_powerbi_columns(columns: list[str], rows: list[dict[str, Any]]) -> tuple[list[str], list[dict[str, Any]]]:
    """Normalize output columns for all Power BI mark formats.

    Requirement:
    - Remove `ese` column/value.
    - Add `final internal marks` as the last column.
    """
    next_columns = list(columns)

    # Remove ESE column from output (case-insensitive match).
    ese_candidates = [c for c in next_columns if str(c).strip().lower() == 'ese']
    for col in ese_candidates:
        next_columns.remove(col)

    # Decide source column for final internal marks.
    final_source = None
    for candidate in ('final internal marks', 'Internal', 'internal', 'after cqi'):
        if candidate in next_columns:
            final_source = candidate
            break

    final_col = 'final internal marks'
    if final_col in next_columns:
        next_columns.remove(final_col)
    next_columns.append(final_col)

    next_rows: list[dict[str, Any]] = []
    for row in rows:
        out = dict(row)
        for col in ese_candidates:
            out.pop(col, None)
        if final_source == final_col:
            out[final_col] = row.get(final_col)
        elif final_source is not None:
            out[final_col] = row.get(final_source)
        else:
            out[final_col] = None
        next_rows.append(out)

    return next_columns, next_rows


def _fetch_theory_prbl_rows(filters: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch PRBL papers from project-lab source for theory format consumers.

    These papers are classified as PRBL in curriculum metadata and should be
    exposed in format 1 (theory) without relabeling them to project/lab.
    """
    where_sql, where_params = _build_where(filters)
    exists_prbl = (
        "(EXISTS ("
        "SELECT 1 FROM curriculum_curriculumdepartment c "
        "WHERE UPPER(c.course_code) = UPPER(p.\"course code\") "
        "AND UPPER(TRIM(COALESCE(c.class_type, ''))) = 'PRBL'"
        ") OR EXISTS ("
        "SELECT 1 FROM curriculum_electivesubject e "
        "WHERE UPPER(e.course_code) = UPPER(p.\"course code\") "
        "AND UPPER(TRIM(COALESCE(e.class_type, ''))) = 'PRBL'"
        "))"
    )
    where_plus = f"{where_sql}{' AND ' if where_sql else ' WHERE '}{exists_prbl}"
    data_sql = f"SELECT * FROM reporting.vw_marks_project_lab p{where_plus}"

    with connection.cursor() as cursor:
        cursor.execute(data_sql, where_params)
        desc = cursor.description or []
        columns = [d.name for d in desc]
        rows_raw = cursor.fetchall()

    out_rows: list[dict[str, Any]] = []
    for row in rows_raw:
        next_row = dict(zip(columns, row))
        next_row['course type'] = 'PRBL'
        out_rows.append(next_row)
    return out_rows


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

    # Performance fast path for project-lab format:
    # COUNT(*) + ORDER BY on the underlying view is very expensive in production.
    # Page 1 returns the full filtered dataset in one scan.
    # For page > 1, return empty quickly to avoid repeated heavy DB work from
    # generic clients that paginate based on `total` even when page 1 already
    # includes all rows.
    if format_key == 'project-lab' and pg > 1:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT * FROM {view_name} LIMIT 0")
            desc = cursor.description or []
            columns = [d.name for d in desc]
        shaped_columns, shaped_rows = _reshape_powerbi_columns(columns, [])
        return QueryResult(columns=shaped_columns, rows=shaped_rows, total=0)

    if format_key == 'project-lab' and pg == 1:
        data_sql = f"SELECT * FROM {view_name}{where_sql}"
        with connection.cursor() as cursor:
            cursor.execute(data_sql, where_params)
            desc = cursor.description or []
            columns = [d.name for d in desc]
            rows_raw = cursor.fetchall()
        rows: list[dict[str, Any]] = [dict(zip(columns, row)) for row in rows_raw]
        rows = _enrich_project_lab_metadata(rows)
        rows = _inject_missing_project_rows_from_final_internal(columns=columns, rows=rows, filters=filters)
        columns, rows = _apply_format_course_type_rules(format_key=format_key, columns=columns, rows=rows)
        shaped_columns, shaped_rows = _reshape_powerbi_columns(columns, rows)
        return QueryResult(columns=shaped_columns, rows=shaped_rows, total=len(shaped_rows))

    if format_key == 'theory' and pg == 1:
        data_sql = f"SELECT * FROM {view_name}{where_sql}"
        with connection.cursor() as cursor:
            cursor.execute(data_sql, where_params)
            desc = cursor.description or []
            columns = [d.name for d in desc]
            rows_raw = cursor.fetchall()

        rows: list[dict[str, Any]] = [dict(zip(columns, row)) for row in rows_raw]
        rows = _inject_missing_theory_rows_from_final_internal(columns=columns, rows=rows, filters=filters)
        rows = _apply_theory_entered_co_splits(rows)

        columns, rows = _apply_format_course_type_rules(format_key=format_key, columns=columns, rows=rows)
        shaped_columns, shaped_rows = _reshape_powerbi_columns(columns, rows)
        return QueryResult(columns=shaped_columns, rows=shaped_rows, total=len(shaped_rows))

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
    if format_key == 'project-lab':
        rows = _enrich_project_lab_metadata(rows)
    columns, rows = _apply_format_course_type_rules(format_key=format_key, columns=columns, rows=rows)
    shaped_columns, shaped_rows = _reshape_powerbi_columns(columns, rows)
    return QueryResult(columns=shaped_columns, rows=shaped_rows, total=len(shaped_rows) if pg == 1 else total)
