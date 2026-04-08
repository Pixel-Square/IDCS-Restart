"""
Backend API endpoint for Final Result export.
Resolves course-wise marks per student entirely server-side.

Strategy:
  1. Find all students of the department (via Section → Batch → Course → Department)
  2. Get ALL their CoeExamDummy records for the semester (including OE/cross-dept)
  3. Map each dummy → course via:
     a. Global KV store (coe-course-bundle-dummies-v1 across ALL departments)
     b. Curriculum fallback (TeachingAssignment / CurriculumDepartment / ElectiveChoice)
  4. Include CoeArrearStudent entries
  5. Return one row per student per course with total marks
"""
from __future__ import annotations

from collections import defaultdict

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import StudentProfile
from accounts.utils import get_user_permissions
from .models import CoeArrearStudent, CoeExamDummy, CoeKeyValueStore, CoeStudentMarks
from .views import _normalize_department_label


COE_PORTAL_LOGIN_EMAIL = 'coe@krct.ac.in'
COE_PORTAL_ACCESS_PERMISSION = 'coe.portal.access'

SHUFFLED_LIST_KV_KEY = 'coe-students-shuffled-list-v1'
ADDITIONAL_LOG_KV_KEY = 'coe-additional-students-log-v1'

# Non-ESE courses (projects, internships, etc.) — excluded from Final Result
NON_ESE_COURSE_CODES: set[str] = {
    '20EC8501',  # Project Phase II
}

# The shuffled list / bundle KV stores use short dept labels (CE, ME)
# while the frontend sends CIVIL, MECH etc. Map all possible aliases.
DEPT_FILTER_KEY_ALIASES: dict[str, list[str]] = {
    'CSE': ['CSE'],
    'MECH': ['ME', 'MECH'],
    'ECE': ['ECE'],
    'EEE': ['EEE'],
    'CIVIL': ['CE', 'CIVIL'],
    'AIDS': ['AI&DS', 'AIDS'],
    'AIML': ['AI&ML', 'AIML'],
    'IT': ['IT'],
    # Reverse lookups
    'ME': ['ME', 'MECH'],
    'CE': ['CE', 'CIVIL'],
    'AI&DS': ['AI&DS', 'AIDS'],
    'AI&ML': ['AI&ML', 'AIML'],
}


def _has_portal_access(user, permission_codes: set[str]) -> bool:
    if getattr(user, 'is_superuser', False):
        return True
    email = str(getattr(user, 'email', '') or '').strip().lower()
    if email == COE_PORTAL_LOGIN_EMAIL:
        return True
    return COE_PORTAL_ACCESS_PERMISSION in permission_codes


def _student_name(sp) -> str:
    """Return full name from User model; fallback to username."""
    user_obj = getattr(sp, 'user', None)
    if not user_obj:
        return str(getattr(sp, 'reg_no', '') or '')
    first = str(getattr(user_obj, 'first_name', '') or '').strip()
    last = str(getattr(user_obj, 'last_name', '') or '').strip()
    full = f'{first} {last}'.strip()
    return full or str(getattr(user_obj, 'username', '') or '')


def _compute_total(marks: dict, qp_type: str) -> int:
    """Compute total marks matching BarScanMarkEntry logic."""
    qp = (qp_type or 'QP1').strip().upper()

    if qp in ('TCPR', 'TCPL'):
        written = 0
        review = 0
        for key, val in marks.items():
            try:
                n = float(val)
            except (ValueError, TypeError):
                continue
            if key == 'review':
                review = n
            else:
                written += n
        return round((written / 80) * 70) + int(review)

    total = 0
    for val in marks.values():
        try:
            total += float(val)
        except (ValueError, TypeError):
            continue
    return int(total)


# ─── Helper: get all possible filter keys for a department ────────────────────

def _get_dept_filter_keys(department: str, semester: str) -> list[str]:
    """
    Return all possible filter keys (e.g. 'CE::SEM8', 'CIVIL::SEM8')
    for the given department, to look up shuffled list / bundle KV stores.
    """
    normalized = _normalize_department_label([department.strip().upper()]) or department.strip().upper()
    variants: set[str] = {department.strip().upper(), normalized}
    for v in list(variants):
        variants.update(DEPT_FILTER_KEY_ALIASES.get(v, []))
    return [f'{v}::{semester}' for v in sorted(variants)]


# ─── Helper: read shuffled list from KV store ────────────────────────────────

def _read_shuffled_list_for_dept(department: str, semester: str) -> dict[str, dict]:
    """
    Read the shuffled list KV store and return {dummy_number → {reg_no, name}}
    for all possible filter keys matching this department.
    """
    try:
        kv_obj = CoeKeyValueStore.objects.get(store_name=SHUFFLED_LIST_KV_KEY)
        kv_data = kv_obj.data or {}
    except CoeKeyValueStore.DoesNotExist:
        return {}

    result: dict[str, dict] = {}
    for fk in _get_dept_filter_keys(department, semester):
        entries = kv_data.get(fk)
        if isinstance(entries, dict):
            for dn, info in entries.items():
                if dn and dn not in result:
                    result[dn] = info if isinstance(info, dict) else {}
    return result


# ─── Helper: find department students from sections ──────────────────────────

def _get_department_student_ids(department: str, sem_number: int) -> set[int]:
    """
    Find all StudentProfile IDs belonging to the department for the given semester.
    Resolves via Section → Batch → Course → Department (since home_department is NULL).
    """
    from academics.models import Section, StudentSectionAssignment

    normalized_dept = _normalize_department_label([department.strip().upper()]) or department
    student_ids: set[int] = set()

    section_qs = Section.objects.filter(
        semester__number=sem_number,
    ).select_related('batch__course__department', 'semester')

    for sec in section_qs:
        try:
            dept_obj = sec.batch.course.department
        except Exception:
            continue
        if not dept_obj:
            continue

        dept_name = _normalize_department_label([
            str(getattr(dept_obj, 'short_name', '') or '').strip().upper(),
            str(getattr(dept_obj, 'code', '') or '').strip().upper(),
            str(getattr(dept_obj, 'name', '') or '').strip().upper(),
        ])
        if not dept_name or dept_name != normalized_dept:
            continue

        ssa_qs = StudentSectionAssignment.objects.filter(
            section=sec, end_date__isnull=True,
        ).exclude(student__status__in=['INACTIVE', 'DEBAR']).values_list('student_id', flat=True)
        student_ids.update(ssa_qs)

    return student_ids


# ─── Helper: build global dummy → course map from KV store ───────────────────

def _build_global_dummy_to_course() -> dict[str, tuple[str, str]]:
    """
    Scan ALL entries in coe-course-bundle-dummies-v1 to build
    {dummy_number → (course_code, course_name)}.
    """
    try:
        kv_obj = CoeKeyValueStore.objects.get(store_name='coe-course-bundle-dummies-v1')
        kv_data = kv_obj.data or {}
    except CoeKeyValueStore.DoesNotExist:
        return {}

    result: dict[str, tuple[str, str]] = {}
    for _dept_key, dept_data in kv_data.items():
        if not isinstance(dept_data, dict):
            continue
        for course_key, course_info in dept_data.items():
            parts = course_key.split('::')
            cc = parts[2] if len(parts) > 2 else ''
            cn = parts[3] if len(parts) > 3 else ''
            for dn in (course_info.get('courseDummies') or []):
                if dn and dn not in result:
                    result[dn] = (cc, cn)
    return result


# ─── Helper: build student → courses from curriculum ─────────────────────────

def _build_student_course_map(student_ids: set[int], sem_number: int) -> dict[int, list[tuple[str, str]]]:
    """
    For the given students, find ALL courses they are enrolled in for the semester.
    Includes department courses AND open electives from OTHER departments.
    Returns {student_id → [(course_code, course_name), ...]}.
    """
    from academics.models import TeachingAssignment, StudentSectionAssignment, Section
    from curriculum.models import CurriculumDepartment, ElectiveChoice

    student_courses: dict[int, set[str]] = defaultdict(set)  # sid → set of course_codes
    course_name_map: dict[str, str] = {}  # course_code → course_name

    # 1. Elective courses via ElectiveChoice (cross-department OE, PE, etc.)
    ec_qs = ElectiveChoice.objects.filter(
        is_active=True,
        student_id__in=list(student_ids),
    ).select_related('elective_subject', 'elective_subject__semester')

    for ec in ec_qs:
        es = getattr(ec, 'elective_subject', None)
        if not es:
            continue
        es_sem = getattr(es, 'semester', None)
        if not es_sem or getattr(es_sem, 'number', None) != sem_number:
            continue
        cc = str(getattr(es, 'course_code', '') or '').strip()
        cn = str(getattr(es, 'course_name', '') or '').strip()
        if cc:
            course_name_map[cc] = cn
            student_courses[ec.student_id].add(cc)

    # 2. Mandatory curriculum courses from sections (for ALL departments the student is in)
    section_qs = Section.objects.filter(
        semester__number=sem_number,
    ).select_related('batch__course__department', 'semester')

    for sec in section_qs:
        try:
            dept_obj = sec.batch.course.department
        except Exception:
            continue
        if not dept_obj:
            continue

        ssa_qs = StudentSectionAssignment.objects.filter(
            section=sec, end_date__isnull=True,
        ).exclude(student__status__in=['INACTIVE', 'DEBAR']).values_list('student_id', flat=True)
        sec_student_ids = set(ssa_qs) & student_ids
        if not sec_student_ids:
            continue

        mandatory = CurriculumDepartment.objects.filter(
            department=dept_obj,
            semester=sec.semester,
            is_elective=False,
        )
        for mc in mandatory:
            cc = str(getattr(mc, 'course_code', '') or '').strip()
            cn = str(getattr(mc, 'course_name', '') or '').strip()
            if not cc:
                continue
            if cn:
                course_name_map[cc] = cn
            for sid in sec_student_ids:
                student_courses[sid].add(cc)

    # 3. Non-elective TeachingAssignment courses (all depts, not just student's)
    ta_qs = TeachingAssignment.objects.filter(
        is_active=True,
        section__semester__number=sem_number,
    ).select_related(
        'section', 'section__semester',
        'curriculum_row', 'subject',
    )

    for ta in ta_qs:
        cc, cn = '', ''
        if getattr(ta, 'curriculum_row', None):
            cc = str(getattr(ta.curriculum_row, 'course_code', '') or '').strip()
            cn = str(getattr(ta.curriculum_row, 'course_name', '') or '').strip()
        elif getattr(ta, 'subject', None):
            cc = str(getattr(ta.subject, 'code', '') or '').strip()
            cn = str(getattr(ta.subject, 'name', '') or '').strip()
        if not cc:
            continue
        if cn:
            course_name_map[cc] = cn

        if getattr(ta, 'section_id', None):
            ssa_qs = StudentSectionAssignment.objects.filter(
                section=ta.section, end_date__isnull=True,
            ).exclude(student__status__in=['INACTIVE', 'DEBAR']).values_list('student_id', flat=True)
            for sid in ssa_qs:
                if sid in student_ids:
                    student_courses[sid].add(cc)

    # Convert to list of tuples
    result: dict[int, list[tuple[str, str]]] = {}
    for sid, codes in student_courses.items():
        result[sid] = [(cc, course_name_map.get(cc, '')) for cc in sorted(codes)]
    return result


# ─── Main view ───────────────────────────────────────────────────────────────

class CoeFinalResultView(APIView):
    """
    GET /api/coe/final-result/?department=CSE&semester=SEM8

    Returns per-student, per-course marks for ALL courses taken by
    students of the department (including OE/electives from other depts,
    arrear students, and additional students).
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        permission_codes = {str(p or '').strip().lower() for p in get_user_permissions(user)}
        if not _has_portal_access(user, permission_codes):
            return Response({'detail': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

        department = str(request.query_params.get('department', '') or '').strip()
        semester = str(request.query_params.get('semester', '') or '').strip().upper()

        if not department or not semester:
            return Response(
                {'detail': 'department and semester query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sem_number = None
        sem_str = semester.replace('SEM', '')
        try:
            sem_number = int(sem_str)
        except (ValueError, TypeError):
            return Response({
                'department': department, 'semester': semester, 'results': [],
                'message': 'Invalid semester format.',
            })

        # ── Step 1: Find ALL students of this department ─────────────────
        student_ids = _get_department_student_ids(department, sem_number)

        if not student_ids:
            # Check arrear-only scenario
            arrear_results = self._get_arrear_results(department, semester, sem_number)
            if arrear_results:
                return Response({
                    'department': department, 'semester': semester,
                    'results': arrear_results,
                })
            return Response({
                'department': department, 'semester': semester, 'results': [],
                'message': f'No students found for {department} {semester}.',
            })

        # ── Step 2: Get ALL dummies for these students in this semester ───
        exam_dummies = CoeExamDummy.objects.filter(
            student_id__in=list(student_ids),
            semester=semester,
        ).select_related('student__user')

        # Build student_id → [dummy_info, ...]
        student_dummies: dict[int, list[dict]] = defaultdict(list)
        all_dummy_numbers: set[str] = set()
        for ed in exam_dummies:
            dn = ed.dummy_number
            all_dummy_numbers.add(dn)
            student_dummies[ed.student_id].append({
                'dummy_number': dn,
                'qp_type': str(ed.qp_type or 'QP1').strip().upper(),
            })

        # ── Step 3: Get marks for all dummies ────────────────────────────
        dummy_to_marks: dict[str, dict] = {}
        for ms in CoeStudentMarks.objects.filter(dummy_number__in=list(all_dummy_numbers)):
            dummy_to_marks[ms.dummy_number] = {
                'marks': ms.marks or {},
                'qp_type': str(ms.qp_type or 'QP1').strip().upper(),
            }

        # ── Step 4: Build dummy → course mapping ────────────────────────
        # 4a. Global KV store mapping (all depts)
        global_dummy_course = _build_global_dummy_to_course()

        # 4b. Curriculum-based mapping for dummies not in KV
        student_course_map = _build_student_course_map(student_ids, sem_number)

        # ── Step 5: Resolve each student's dummy → course ────────────────
        profiles = {
            sp.id: sp for sp in
            StudentProfile.objects.filter(id__in=list(student_ids)).select_related('user')
        }

        results: list[dict] = []

        for sid in sorted(student_ids):
            sp = profiles.get(sid)
            if not sp:
                continue

            reg_no = str(getattr(sp, 'reg_no', '') or '')
            name = _student_name(sp)
            dummies = student_dummies.get(sid, [])
            enrolled_courses = student_course_map.get(sid, [])

            # Track which courses this student has been assigned a result for
            assigned_courses: dict[str, dict] = {}  # course_code → result dict
            used_dummies: set[str] = set()

            # Pass 1: Assign dummies via KV store (known course mapping)
            for d in dummies:
                dn = d['dummy_number']
                if dn in global_dummy_course:
                    cc, cn = global_dummy_course[dn]
                    if not cc:
                        continue
                    if cc in assigned_courses:
                        continue  # Already have a dummy for this course
                    marks_entry = dummy_to_marks.get(dn)
                    total = _compute_total(
                        marks_entry['marks'], marks_entry['qp_type'],
                    ) if marks_entry else 0
                    assigned_courses[cc] = {
                        'reg_no': reg_no, 'name': name,
                        'course_code': cc, 'course_name': cn,
                        'dummy_number': dn, 'total_marks': total,
                    }
                    used_dummies.add(dn)

            # Pass 2: Match remaining dummies to unassigned curriculum courses
            remaining_dummies = [d for d in dummies if d['dummy_number'] not in used_dummies]
            unmatched_courses = [
                (cc, cn) for cc, cn in enrolled_courses
                if cc not in assigned_courses
            ]

            # Sort remaining dummies: prefer those with marks
            remaining_dummies.sort(
                key=lambda d: (0 if d['dummy_number'] in dummy_to_marks else 1)
            )

            for cc, cn in unmatched_courses:
                if not remaining_dummies:
                    # Enrolled but no dummy left — still emit a row
                    assigned_courses[cc] = {
                        'reg_no': reg_no, 'name': name,
                        'course_code': cc, 'course_name': cn,
                        'dummy_number': '', 'total_marks': 0,
                    }
                    continue

                d = remaining_dummies.pop(0)
                dn = d['dummy_number']
                marks_entry = dummy_to_marks.get(dn)
                total = _compute_total(
                    marks_entry['marks'], marks_entry['qp_type'],
                ) if marks_entry else 0
                assigned_courses[cc] = {
                    'reg_no': reg_no, 'name': name,
                    'course_code': cc, 'course_name': cn,
                    'dummy_number': dn, 'total_marks': total,
                }
                used_dummies.add(dn)

            # Pass 3: Any leftover dummies (additional / unknown courses)
            for d in remaining_dummies:
                dn = d['dummy_number']
                if dn in used_dummies:
                    continue
                marks_entry = dummy_to_marks.get(dn)
                total = _compute_total(
                    marks_entry['marks'], marks_entry['qp_type'],
                ) if marks_entry else 0
                assigned_courses[f'_EXTRA_{dn}'] = {
                    'reg_no': reg_no, 'name': name,
                    'course_code': '', 'course_name': '',
                    'dummy_number': dn, 'total_marks': total,
                }

            results.extend(assigned_courses.values())

        # ── Step 6: Add arrear / additional students from shuffled list ──
        # Build regular student reg_nos so the extra-finder can identify outsiders
        regular_reg_nos: set[str] = set()
        for sid in student_ids:
            sp = profiles.get(sid)
            if sp:
                rn = str(getattr(sp, 'reg_no', '') or '').strip()
                if rn:
                    regular_reg_nos.add(rn)

        extra_results = self._get_extra_students_from_shuffled_list(
            department, semester, sem_number, regular_reg_nos,
            all_dummy_numbers, global_dummy_course,
        )
        existing_reg_course = {
            (r['reg_no'], r['course_code']) for r in results
        }
        for er in extra_results:
            key = (er['reg_no'], er['course_code'])
            if key not in existing_reg_course:
                results.append(er)
                existing_reg_course.add(key)

        # Filter out non-ESE courses (projects, internships, etc.)
        results = [
            r for r in results
            if r['course_code'] not in NON_ESE_COURSE_CODES
        ]

        results.sort(key=lambda r: (r['course_code'], r['reg_no']))
        return Response({
            'department': department, 'semester': semester, 'results': results,
        })

    def _get_extra_students_from_shuffled_list(
        self,
        department: str,
        semester: str,
        sem_number: int,
        regular_reg_nos: set[str],
        already_used_dummies: set[str],
        global_dummy_course: dict[str, tuple[str, str]],
    ) -> list[dict]:
        """
        Find arrear / additional students who belong to this department
        and return ALL their exam entries across ALL departments.

        An arrear student from CSE may have dummies in CSE (their own dept)
        AND in ECE, MECH etc. (arrear courses in other depts).  All of these
        should appear in the CSE Final Result.

        Strategy:
          A. Identify arrear/additional reg_nos from three sources:
             1. CoeArrearStudent where department = this dept
             2. Additional students log where dept = this dept
             3. This dept's shuffled list: any reg_no NOT in regular students
                AND whose dummy has NO CoeExamDummy record
          B. For every identified reg_no, scan ALL shuffled lists across ALL
             departments to find ALL their dummies
          C. For each dummy, resolve course from the global bundle KV map,
             compute marks, and add to results
        """
        # ── Load the entire shuffled list KV (single DB read) ────────────
        try:
            kv_obj = CoeKeyValueStore.objects.get(store_name=SHUFFLED_LIST_KV_KEY)
            all_shuffled: dict = kv_obj.data or {}
        except CoeKeyValueStore.DoesNotExist:
            return []

        normalized_dept = (
            _normalize_department_label([department.strip().upper()])
            or department.strip().upper()
        )

        # ── A: Identify arrear / additional reg_nos for this department ──
        extra_reg_nos: set[str] = set()

        # A1: CoeArrearStudent
        for a in CoeArrearStudent.objects.filter(semester=semester):
            a_dept = _normalize_department_label(
                [str(a.department or '').strip().upper()]
            )
            if a_dept == normalized_dept:
                reg = str(a.student_register_number or '').strip()
                if reg:
                    extra_reg_nos.add(reg)

        # A2: Additional students log
        try:
            log_kv = CoeKeyValueStore.objects.get(store_name=ADDITIONAL_LOG_KV_KEY)
            log_data = log_kv.data
            if isinstance(log_data, list):
                for entry in log_data:
                    e_dept = _normalize_department_label(
                        [str(entry.get('dept', '') or '').strip().upper()]
                    )
                    if e_dept == normalized_dept:
                        reg = str(entry.get('regNo', '') or '').strip()
                        if reg:
                            extra_reg_nos.add(reg)
        except CoeKeyValueStore.DoesNotExist:
            pass

        # A3: This dept's shuffled list — reg_nos NOT in regular students
        #     who have NO StudentProfile at all (true arrear/additional)
        dept_shuffled = _read_shuffled_list_for_dept(department, semester)
        non_regular_candidate_regs: set[str] = set()
        for _dn, info in dept_shuffled.items():
            reg = str(info.get('reg_no', '') or '').strip()
            if reg and reg not in regular_reg_nos and reg not in extra_reg_nos:
                non_regular_candidate_regs.add(reg)

        if non_regular_candidate_regs:
            # Check which candidate reg_nos actually have a StudentProfile.
            # Those WITH a profile are regular students from other departments
            # (e.g. OE students) — they'll be handled in their own dept's flow.
            # Those WITHOUT a profile are true arrear/additional students.
            regs_with_profile = set(
                StudentProfile.objects.filter(
                    reg_no__in=list(non_regular_candidate_regs),
                ).values_list('reg_no', flat=True)
            )
            for reg in non_regular_candidate_regs:
                if reg not in regs_with_profile:
                    extra_reg_nos.add(reg)

        if not extra_reg_nos:
            return []

        # ── B: Scan THIS department's shuffled list only ─────────────────
        # Each department's Final Result shows only courses from its own
        # shuffled list.  Cross-dept courses appear in the OTHER dept's result.
        reg_dummy_map: dict[str, dict[str, dict]] = {}  # reg → {dummy → info}
        dept_filter_keys = set(_get_dept_filter_keys(department, semester))
        for fk, entries in all_shuffled.items():
            if not isinstance(entries, dict):
                continue
            if fk not in dept_filter_keys:
                continue
            for dn, info in entries.items():
                if not isinstance(info, dict):
                    continue
                reg = str(info.get('reg_no', '') or '').strip()
                if reg not in extra_reg_nos:
                    continue
                if reg not in reg_dummy_map:
                    reg_dummy_map[reg] = {}
                if dn not in reg_dummy_map[reg]:
                    reg_dummy_map[reg][dn] = info

        if not reg_dummy_map:
            return []

        # Flatten all dummies for extra students.
        # NOTE: Do NOT subtract already_used_dummies here — arrear/additional
        # students share dummy numbers with regular students (CoeExamDummy),
        # but their marks are distinct entries in the shuffled list.
        all_extra_dummies: set[str] = set()
        for dummies in reg_dummy_map.values():
            all_extra_dummies.update(dummies.keys())

        if not all_extra_dummies:
            return []

        # ── C: Resolve course + marks for each dummy ────────────────────
        # Get marks
        extra_marks: dict[str, dict] = {}
        for ms in CoeStudentMarks.objects.filter(
            dummy_number__in=list(all_extra_dummies)
        ):
            extra_marks[ms.dummy_number] = {
                'marks': ms.marks or {},
                'qp_type': str(ms.qp_type or 'QP1').strip().upper(),
            }

        # Build arrear course map (reg → [(code, name)]) for fallback
        arrear_course_map: dict[str, list[tuple[str, str]]] = {}
        for a in CoeArrearStudent.objects.filter(semester=semester):
            reg = str(a.student_register_number or '').strip()
            if reg in extra_reg_nos:
                if reg not in arrear_course_map:
                    arrear_course_map[reg] = []
                cc = str(a.course_code or '').strip()
                cn = str(a.course_name or '').strip()
                if cc:
                    arrear_course_map[reg].append((cc, cn))

        results: list[dict] = []
        for reg_no, dummies in reg_dummy_map.items():
            name = ''
            # Track courses already assigned to this student's dummies
            # so the arrear fallback doesn't reuse the same course
            assigned_courses_for_student: set[str] = set()

            # First pass: resolve dummies with definitive bundle KV mapping
            resolved: list[tuple[str, dict, str, str]] = []
            unresolved: list[tuple[str, dict]] = []
            for dn, info in dummies.items():
                if not name:
                    name = str(info.get('name', '') or '').strip()
                if dn not in all_extra_dummies:
                    continue

                cc, cn = '', ''
                if dn in global_dummy_course:
                    cc, cn = global_dummy_course[dn]

                if cc:
                    resolved.append((dn, info, cc, cn))
                    assigned_courses_for_student.add(cc)
                else:
                    unresolved.append((dn, info))

            # Second pass: try arrear fallback for unresolved dummies
            # Only assign courses that haven't been used yet
            arrear_courses = list(arrear_course_map.get(reg_no, []))
            still_unresolved: list[tuple[str, dict]] = []
            for dn, info in unresolved:
                cc, cn = '', ''
                for arr_cc, arr_cn in arrear_courses:
                    if arr_cc and arr_cc not in assigned_courses_for_student:
                        cc, cn = arr_cc, arr_cn
                        assigned_courses_for_student.add(arr_cc)
                        break

                if cc:
                    resolved.append((dn, info, cc, cn))
                else:
                    still_unresolved.append((dn, info))

            # Third pass: infer course from CoeExamDummy's original student
            # If the dummy is in CoeExamDummy for a different student, find
            # what course that student had for this dummy via their curriculum.
            if still_unresolved:
                unresolved_dns = [dn for dn, _ in still_unresolved]
                ced_map: dict[str, int] = {}  # dummy → original student_id
                for ced in CoeExamDummy.objects.filter(
                    dummy_number__in=unresolved_dns,
                ):
                    ced_map[ced.dummy_number] = ced.student_id

                # Group by original student to batch curriculum lookups
                orig_students: dict[int, list[str]] = {}  # sid → [dummy_numbers]
                for dn, sid in ced_map.items():
                    orig_students.setdefault(sid, []).append(dn)

                resolved_indices: set[int] = set()

                for orig_sid, orig_dns in orig_students.items():
                    # Get this student's enrolled courses
                    scm = _build_student_course_map({orig_sid}, sem_number)
                    enrolled = scm.get(orig_sid, [])
                    # Get this student's ALL dummies and their resolved courses
                    all_orig_dummies = list(
                        CoeExamDummy.objects.filter(
                            student_id=orig_sid, semester=semester,
                        ).values_list('dummy_number', flat=True)
                    )
                    orig_resolved: set[str] = set()
                    for od in all_orig_dummies:
                        if od in global_dummy_course:
                            occ, _ = global_dummy_course[od]
                            if occ:
                                orig_resolved.add(occ)
                    # Unresolved enrolled courses for the original student
                    orig_unmatched = [
                        (ecc, ecn) for ecc, ecn in enrolled
                        if ecc not in orig_resolved
                    ]
                    orig_unresolved_dns = [
                        od for od in all_orig_dummies
                        if od not in global_dummy_course and od in set(orig_dns)
                    ]
                    # If exactly 1 unresolved course matches 1 unresolved dummy
                    if len(orig_unmatched) >= 1 and len(orig_unresolved_dns) >= 1:
                        matched_count = min(len(orig_unmatched), len(orig_unresolved_dns))
                        for mi in range(matched_count):
                            inferred_cc, inferred_cn = orig_unmatched[mi]
                            inferred_dn = orig_unresolved_dns[mi]
                            for idx, (dn, info) in enumerate(still_unresolved):
                                if idx in resolved_indices:
                                    continue
                                if dn == inferred_dn:
                                    resolved_indices.add(idx)
                                    resolved.append((dn, info, inferred_cc, inferred_cn))
                                    assigned_courses_for_student.add(inferred_cc)
                                    break

                # Add any remaining truly unresolved
                for idx, (dn, info) in enumerate(still_unresolved):
                    if idx not in resolved_indices:
                        resolved.append((dn, info, '', ''))

            # Emit results
            for dn, info, cc, cn in resolved:
                marks_entry = extra_marks.get(dn)
                total = _compute_total(
                    marks_entry['marks'], marks_entry['qp_type'],
                ) if marks_entry else 0

                # Skip entries with no marks record at all (unassigned dummy)
                if not marks_entry:
                    continue

                # Skip entries with no course AND no marks (test/junk data)
                if not cc and total == 0:
                    continue

                results.append({
                    'reg_no': reg_no,
                    'name': name,
                    'course_code': cc,
                    'course_name': cn,
                    'dummy_number': dn,
                    'total_marks': total,
                })

        return results
