"""
Real-time fallback reporting service that queries mark tables directly
when views don't exist (used for quick Power BI integration).
Fetches data from Academic 2.1 app - student marks by course/section.
"""
from typing import Any
from django.db import connection


def get_simple_marks_data(
    page: int = 1, 
    page_size: int = 500,
    filters: dict = None
) -> dict[str, Any]:
    """Query student marks from Academic 2.1 tables with real data.
    
    Returns: {
        'columns': [col1, col2, ...],
        'rows': [row1, row2, ...],
        'total': N
    }
    """
    filters = filters or {}
    offset = (page - 1) * page_size
    
    # Build WHERE clauses from filters safely
    where_clauses = ["acvsm.student_id IS NOT NULL"]
    params: list[Any] = []

    # Normalize filter keys
    course_code = (filters.get('course_code') or '').strip() if filters.get('course_code') else None
    sec = (filters.get('sec') or filters.get('section') or '').strip() if (filters.get('sec') or filters.get('section')) else None
    sem = (filters.get('sem') or '').strip() if filters.get('sem') else None
    course_type = (filters.get('course_type') or '').strip() if filters.get('course_type') else None

    if course_code:
        where_clauses.append("ac.subject_code ILIKE %s")
        params.append(course_code)
    if sec:
        where_clauses.append("acvs.section_name ILIKE %s")
        params.append(sec)
    if sem:
        # sem.number is an integer stored as text in query; match by text
        where_clauses.append("CAST(sem.number AS TEXT) = %s")
        params.append(sem)
    if course_type:
        where_clauses.append("(ct.name ILIKE %s OR ac.class_type_name ILIKE %s)")
        params.extend([course_type, course_type])

    where_sql = " AND ".join(where_clauses)

    sql = f"""
        SELECT
            'N/A'::text AS year,
            COALESCE(sem.number::text, '1') AS sem,
            'DEPT'::text AS dept,
            COALESCE(acvs.section_name, 'SEC')::text AS sec,
            SUBSTR(COALESCE(sp.reg_no, '000000'), -12) AS "reg no (last 12 digit)",
            COALESCE(au.first_name || ' ' || au.last_name, sp.reg_no) AS name,
            COALESCE(ct.name, ac.class_type_name, 'THEORY') AS "course type",
            COALESCE(ac.subject_code, '')::text AS "course code",
            'CORE'::text AS "course category",
            COALESCE(ac.subject_name, '')::text AS "course name",
            COALESCE(au_fac.id::text, '') AS staff_id,
            COALESCE(au_fac.first_name || ' ' || au_fac.last_name, '') AS staff_name,
            MAX(CASE WHEN LOWER(COALESCE(acvea.qp_type, acvea.exam)) LIKE '%%ssa%%' AND acvea.exam ILIKE '%%1%%' THEN acvsm.total_mark ELSE NULL END) AS ssa1,
            MAX(CASE WHEN LOWER(COALESCE(acvea.qp_type, acvea.exam)) LIKE '%%ssa%%' AND acvea.exam ILIKE '%%2%%' THEN acvsm.total_mark ELSE NULL END) AS ssa2,
            MAX(CASE WHEN LOWER(COALESCE(acvea.qp_type, acvea.exam)) LIKE '%%cia%%' AND acvea.exam ILIKE '%%1%%' THEN acvsm.total_mark ELSE NULL END) AS cia1,
            MAX(CASE WHEN LOWER(COALESCE(acvea.qp_type, acvea.exam)) LIKE '%%cia%%' AND acvea.exam ILIKE '%%2%%' THEN acvsm.total_mark ELSE NULL END) AS cia2,
            MAX(CASE WHEN LOWER(COALESCE(acvea.qp_type, acvea.exam)) LIKE '%%model%%' THEN acvsm.total_mark ELSE NULL END) AS model_exam,
            ROUND(MAX(acvsm.weighted_mark), 2) AS internal_mark
        FROM acv2_student_mark acvsm
        LEFT JOIN acv2_exam_assignment acvea ON acvsm.exam_assignment_id = acvea.id
        LEFT JOIN acv2_section acvs ON acvea.section_id = acvs.id
        LEFT JOIN acv2_course ac ON acvs.course_id = ac.id
        LEFT JOIN acv2_class_type ct ON ac.class_type_id = ct.id
        LEFT JOIN academics_studentprofile sp ON acvsm.student_id = sp.id
        LEFT JOIN accounts_user au ON sp.user_id = au.id
        LEFT JOIN academics_subject subj ON ac.subject_id = subj.id
        LEFT JOIN academics_semester sem ON ac.semester_id = sem.id
        LEFT JOIN accounts_user au_fac ON acvs.faculty_user_id = au_fac.id
        WHERE {where_sql}
        GROUP BY sem.number, acvs.section_name,
                 sp.reg_no, au.first_name, au.last_name,
                 ct.name, ac.class_type_name, ac.subject_code, ac.subject_name,
                 au_fac.id, au_fac.first_name, au_fac.last_name
        ORDER BY sp.reg_no
        LIMIT %s OFFSET %s
    """

    exec_params = params + [page_size, offset]

    with connection.cursor() as cursor:
        cursor.execute(sql, exec_params)
        desc = cursor.description or []
        columns = [d.name for d in desc]
        rows_raw = cursor.fetchall()
        rows = [dict(zip(columns, row)) for row in rows_raw]

        # Get total count (distinct students) with same filters
        count_sql = f"SELECT COUNT(DISTINCT sp.id) FROM acv2_student_mark acvsm LEFT JOIN academics_studentprofile sp ON acvsm.student_id = sp.id LEFT JOIN acv2_exam_assignment acvea ON acvsm.exam_assignment_id = acvea.id LEFT JOIN acv2_section acvs ON acvea.section_id = acvs.id LEFT JOIN acv2_course ac ON acvs.course_id = ac.id LEFT JOIN acv2_class_type ct ON ac.class_type_id = ct.id LEFT JOIN academics_semester sem ON ac.semester_id = sem.id WHERE {where_sql}"
        cursor.execute(count_sql, params)
        total = cursor.fetchone()[0]
    
    return {
        'columns': columns,
        'rows': rows,
        'total': total
    }
