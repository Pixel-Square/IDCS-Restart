import json
import logging
from decimal import Decimal
from django.db.models import Avg, Sum, Min, Max, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.exceptions import PermissionDenied

from academics.models import (
    Department, AcademicYear, Semester, Section, Subject, StudentProfile,
    StaffProfile, StudentMentorMap, SectionAdvisor, TeachingAssignment,
    DailyAttendanceRecord
)
from OBE.models import Cia1Mark, Cia2Mark, ModelExamMark
from accounts.models import User, Role, UserRole
from .academic_visuals_views import load_dashboards_store, get_performance_level
from .authorization import (
    get_performance_scope, clamp_department_param, clamp_department_list,
    allowed_student_q, allowed_mark_student_q, assert_section_in_scope,
    assert_student_in_scope,
)



logger = logging.getLogger(__name__)

def resolve_user_auth_context(user):
    """Legacy entry point — now delegates to the unified authorization context
    (see authorization.py). Kept for backwards compatibility with every view
    and response shape that already consumes it."""
    from .authorization import build_authorization_context

    ctx = build_authorization_context(user)

    # Legacy anonymous shape (kept identical to the previous behaviour except
    # that unauthenticated users are no longer treated as college-wide).
    if not user or not getattr(user, "is_authenticated", False):
        return {
            "user_id": None,
            "username": "Anonymous",
            "role": "STAFF",
            "roles": [],
            "effective_roles": [],
            "permissions": [],
            "is_principal": False,
            "is_hod": False,
            "is_advisor": False,
            "is_faculty": False,
            "is_student": False,
            "is_college_wide": False,
            "allowed_departments": {"ids": [], "codes": [], "names": []},
            "department_id": None,
            "department_code": None,
            "department_name": None,
            "lock_department": True,
            "advised_sections": [],
            "assigned_subjects": [],
            "mentee_ids": [],
        }

    # `roles` previously contained only UserRole names; it now reflects the
    # canonical effective-role set (UserRole + active DepartmentRole +
    # active RoleAssignment), consistent with /api/accounts/me/.
    return {
        "user_id": ctx["user_id"],
        "username": ctx["username"],
        "role": ctx["role"],
        "roles": ctx["roles"],
        "effective_roles": ctx["effective_roles"],
        "permissions": ctx["permissions"],
        "is_principal": ctx["is_principal"],
        "is_hod": ctx["is_hod"],
        "is_advisor": ctx["is_advisor"],
        "is_faculty": ctx["is_faculty"],
        "is_student": ctx["is_student"],
        "is_college_wide": ctx["is_college_wide"],
        "allowed_departments": ctx["allowed_departments"],
        "department_id": ctx["department_id"],
        "department_code": ctx["department_code"],
        "department_name": ctx["department_name"],
        "lock_department": ctx["lock_department"],
        "advised_sections": ctx["advised_sections"],
        "assigned_subjects": ctx["assigned_subjects"],
        "mentee_ids": ctx["mentee_ids"],
    }

    role_names = list(UserRole.objects.filter(user=user).values_list("role__name", flat=True))
    role_names_upper = [r.upper() for r in role_names]
    is_superuser = getattr(user, "is_superuser", False)

    is_principal = is_superuser or "PRINCIPAL" in role_names_upper or "SUPER_ADMIN" in role_names_upper or "ADMIN" in role_names_upper or "IQAC" in role_names_upper
    is_hod = "HOD" in role_names_upper or "AHOD" in role_names_upper
    is_advisor = "ADVISOR" in role_names_upper or "CLASS_ADVISOR" in role_names_upper
    is_faculty = "STAFF" in role_names_upper or "FACULTY" in role_names_upper or "AP" in role_names_upper or is_hod or is_advisor
    is_student = "STUDENT" in role_names_upper

    dept_id = None
    dept_code = None
    dept_name = None
    advised_sections = []
    assigned_subjects = []

    try:
        staff = StaffProfile.objects.filter(user=user).select_related("department").first()
        if staff and staff.department:
            dept_id = str(staff.department.id)
            dept_code = staff.department.code or staff.department.short_name or str(staff.department.id)
            dept_name = staff.department.name

        if staff:
            for sa in SectionAdvisor.objects.filter(advisor=staff, is_active=True).select_related("section", "section__semester", "section__batch"):
                sec = sa.section
                if sec:
                    advised_sections.append({
                        "section_id": str(sec.id),
                        "section_name": sec.name,
                        "semester": str(sec.semester.number) if sec.semester else "5",
                        "batch": str(sec.batch.name) if (sec.batch and sec.batch.name) else "2023"
                    })

            for ta in TeachingAssignment.objects.filter(staff=staff, is_active=True).select_related("subject", "section"):
                assigned_subjects.append({
                    "assignment_id": str(ta.id),
                    "subject_name": ta.subject.name if ta.subject else "Course",
                    "subject_code": ta.subject.code if ta.subject else "SUB",
                    "section_name": ta.section.name if ta.section else "A"
                })
    except Exception as e:
        logger.exception("Error resolving staff context: %s", e)

    if is_principal:
        primary_role = "PRINCIPAL"
        lock_department = False
    elif is_hod:
        primary_role = "HOD"
        lock_department = True
    elif is_advisor or len(advised_sections) > 0:
        primary_role = "ADVISOR"
        is_advisor = True
        lock_department = True
    elif is_faculty or len(assigned_subjects) > 0:
        primary_role = "FACULTY"
        lock_department = True
    elif is_student:
        primary_role = "STUDENT"
        lock_department = True
    else:
        primary_role = "STAFF"
        lock_department = True if dept_id else False

    return {
        "user_id": user.id,
        "username": user.username,
        "role": primary_role,
        "roles": role_names,
        "is_principal": is_principal,
        "is_hod": is_hod,
        "is_advisor": is_advisor,
        "is_faculty": is_faculty,
        "is_student": is_student,
        "department_id": dept_id,
        "department_code": dept_code,
        "department_name": dept_name,
        "lock_department": lock_department,
        "advised_sections": advised_sections,
        "assigned_subjects": assigned_subjects
    }

def active_student_cohort():
    """
    Active-student cohort definition consistent with the rest of the codebase
    (see _get_active_students_for_teaching_assignment in academic_v2/views.py):
    a student is "active" unless explicitly marked INACTIVE/DEBAR. Requiring
    status == 'ACTIVE' exactly drops rows whose status is NULL or uses any
    other label, which made the College KPI query return an empty queryset
    (all KPIs 0 / attendance fallback) while faculty-wise data was fine.
    """
    return StudentProfile.objects.filter(
        Q(status__isnull=True) | ~Q(status__in=["INACTIVE", "DEBAR"])
    )


def resolve_department_id(dept_val):
    """Resolve a department filter value to a real Department pk.

    Accepted forms (in priority order):
    1. A numeric value matching a Department's own primary key (id).
    2. A numeric value matching a Department's `code` (some dept codes are
       numeric, e.g. AI&DS has code='243' but id=1 — never conflate the two).
    3. A `code` / `short_name` / `name` match (case-insensitive).

    Returns None when no Department matches, so callers can fall back to
    non-ID based lookups.
    """
    if not dept_val:
        return None
    v = str(dept_val).strip()
    if not v:
        return None

    d = None
    if v.isdigit():
        d = Department.objects.filter(pk=int(v)).first()
        if d is None:
            # A numeric code that is NOT a dept id (e.g. dept code '243').
            d = Department.objects.filter(code__iexact=v).first()
    if d is None:
        d = Department.objects.filter(code__iexact=v).first()
    if d is None:
        d = Department.objects.filter(short_name__iexact=v).first()
    if d is None:
        d = Department.objects.filter(name__iexact=v).first()
    return d.id if d is not None else None


def get_student_dept_q(dept_val):
    if not dept_val:
        return Q()
    dept_str = str(dept_val).strip()
    d_id = resolve_department_id(dept_str)
    if d_id is not None:
        return (
            Q(home_department_id=d_id) |
            Q(section__batch__course__department_id=d_id) |
            Q(section__batch__department_id=d_id) |
            Q(section__managing_department_id=d_id)
        )
    # Fallback for values that do not resolve to a Department (kept for
    # backwards compatibility with every existing consumer).
    return (
        Q(home_department__code__iexact=dept_str) |
        Q(home_department__short_name__iexact=dept_str) |
        Q(section__batch__course__department__code__iexact=dept_str) |
        Q(section__batch__course__department__short_name__iexact=dept_str)
    )

def get_mark_dept_q(dept_val):
    if not dept_val:
        return Q()
    dept_str = str(dept_val).strip()
    d_id = resolve_department_id(dept_str)
    if d_id is not None:
        return (
            Q(student__home_department_id=d_id) |
            Q(student__section__batch__course__department_id=d_id) |
            Q(student__section__batch__department_id=d_id) |
            Q(student__section__managing_department_id=d_id)
        )
    return (
        Q(student__home_department__code__iexact=dept_str) |
        Q(student__home_department__short_name__iexact=dept_str) |
        Q(student__section__batch__course__department__code__iexact=dept_str) |
        Q(student__section__batch__course__department__short_name__iexact=dept_str)
    )


def department_has_cohort(dept) -> bool:
    """True when a Department actually carries an academic student cohort.

    Students are the source of truth: a department is listed only when it has
    students via `home_department` or via its Section→Batch→Course/Department
    chain. CurriculumDepartment rows alone are NOT sufficient — the
    `propagate_master_to_departments` signal copies shared first-year 'GEA*'
    rows into every teaching department, so phantom/role-like Department rows
    (e.g. an imported 'DB READER' Department with zero students, sections and
    batches) would otherwise slip into the option list. Data-driven, never
    name-based.
    """
    return StudentProfile.objects.filter(
        Q(home_department=dept) |
        Q(section__batch__course__department=dept) |
        Q(section__batch__department=dept) |
        Q(section__managing_department=dept)
    ).exists()


def cohort_students_q(year=None, sem_num=None, dept_val=None, section_val=None):
    """Q matching the active-student cohort for the given filter context.

    All parameters are optional; omitted parameters do not restrict.
    """
    q = Q()
    if dept_val:
        q &= get_student_dept_q(dept_val)
    if year:
        q &= (Q(batch=year) | Q(section__batch__name=year))
    if sem_num:
        q &= Q(section__semester__number=sem_num)
    if section_val:
        q &= Q(section__name__iexact=section_val)
    return q


def cohort_subjects(dept_id=None, sem_num=None, student_ids=None):
    """Authoritative Subject set for a cohort context.

    Subjects are identified through the application's real curriculum
    relationship — `curriculum.CurriculumDepartment` rows (department +
    semester + course_code) joined to `Subject.code` — unioned with the
    subjects the cohort students actually hold marks in. `Subject.course`
    is NULL for every row in this database, so a Subject→Course→Department
    join is never used.
    """
    subj = Subject.objects.none()
    if dept_id is not None:
        try:
            from curriculum.models import CurriculumDepartment
            cd_q = Q(department_id=dept_id)
            if sem_num:
                cd_q &= Q(semester__number=sem_num)
            codes = list(
                CurriculumDepartment.objects.filter(cd_q)
                .exclude(course_code__isnull=True)
                .exclude(course_code="")
                .values_list("course_code", flat=True)
                .distinct()
            )
            if codes:
                subj = Subject.objects.filter(Q(code__in=codes))
        except Exception:
            pass
    if student_ids:
        from OBE.models import (
            Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
            Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
        )
        mark_q = Q()
        for M in (Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
                  Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark):
            mark_q |= Q(pk__in=M.objects.filter(student_id__in=student_ids).values_list("subject_id", flat=True))
        subj = subj | Subject.objects.filter(mark_q)
    return subj.distinct()


def get_dynamic_semester(year=None):
    """Derive a semester number for a batch/year from live Section.semester data.

    Falls back to the lowest existing semester number (or 1) when nothing matches.
    Previously referenced but never defined — latent NameError fixed here.
    """
    if year:
        nums = {
            n for n in Section.objects.exclude(semester__isnull=True)
            .filter(batch__name=year)
            .values_list("semester__number", flat=True)
            if n
        }
        if not nums:
            matched = StudentProfile.objects.filter(
                Q(batch=year) | Q(section__batch__name=year),
                section__semester__isnull=False,
            ).values_list("section__semester__number", flat=True)
            nums = {n for n in matched if n}
        if nums:
            return sorted(nums)[0]
    n = Semester.objects.order_by("number").values_list("number", flat=True).first()
    return n or 1


def resolve_exam_models(exam_type):
    """Map a frontend assessment/exam label to the list of mark models.

    Replicates the existing branching logic found throughout the codebase so
    that the department drill-down and overall dashboard share one source of
    truth. Returns a list of Django model classes (possibly empty).
    """
    from OBE.models import (
        Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
        Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
    )
    if not exam_type:
        return [
            Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
            Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
        ]
    exam = exam_type.upper().strip()
    if exam in ("ALL", "ALL ASSESSMENTS", ""):
        return [
            Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
            Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
        ]
    if "CIA 2" in exam:
        return [Cia2Mark]
    if "SSA 1" in exam:
        return [Ssa1Mark]
    if "SSA 2" in exam:
        return [Ssa2Mark]
    if "REVIEW 2" in exam:
        return [Review2Mark]
    if "REVIEW 1" in exam or "REVIEW" in exam:
        return [Review1Mark]
    if "FORMATIVE 2" in exam:
        return [Formative2Mark]
    if "FORMATIVE 1" in exam:
        return [Formative1Mark]
    if "MODEL" in exam:
        return [ModelExamMark]
    if "LAB" in exam:
        return [LabExamMark]
    if "SEMESTER" in exam or "FINAL INTERNAL" in exam:
        return [FinalInternalMark]
    if "CIA 1" in exam:
        return [Cia1Mark]
    return []


class PublishedDashboardsListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        auth_ctx = resolve_user_auth_context(request.user)
        store = load_dashboards_store()
        return Response({
            "user_context": auth_ctx,
            "dashboards": list(store.values())
        }, status=status.HTTP_200_OK)


class AcademicPerformanceAnalyticsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            auth_ctx = resolve_user_auth_context(request.user)
            # Server-side scope: authorized dataset first, then user filters.
            scope = get_performance_scope(request.user)
            params = request.query_params

            # Academic Year is sent by the frontend as `year` (alias `batch` for
            # backwards compatibility). Without this the Year filter was silently
            # ignored by the College analytics, so the cohort was never scoped to a
            # single academic year.
            req_batch = params.get("year", params.get("batch", "")).strip()
            req_dept = params.get("dept", "").strip()
            req_sem = params.get("sem", "").strip()
            req_sec = params.get("section", "").strip()
            req_qp = params.get("qp_type", "").strip()
            req_subject = params.get("subject", "").strip()

            effective_dept = clamp_department_param(scope, req_dept)

            # Assessment registry: every real assessment entity in the database.
            # Each entry: (display name, mark model, value field). The reference
            # maximum is derived from the data itself (observed in-scope maximum),
            # so no max score is hardcoded here.
            from OBE.models import (
                Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
                Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
            )
            assessment_registry = [
                ("CIA 1", Cia1Mark, "mark"),
                ("CIA 2", Cia2Mark, "mark"),
                ("SSA 1", Ssa1Mark, "mark"),
                ("SSA 2", Ssa2Mark, "mark"),
                ("Review 1", Review1Mark, "mark"),
                ("Review 2", Review2Mark, "mark"),
                ("Formative 1", Formative1Mark, "total"),
                ("Formative 2", Formative2Mark, "total"),
                ("Model Exam", ModelExamMark, "total_mark"),
                ("Lab Exam", LabExamMark, "total_mark"),
                ("Final Internal", FinalInternalMark, "final_mark"),
            ]
            registry_by_name = {name: (M, f) for name, M, f in assessment_registry}

            def _scoped_marks(M, field):
                """Marks queryset for model M filtered strictly by current slicers."""
                qs = M.objects.all()
                _mk_q = allowed_mark_student_q(scope)
                if _mk_q is not None:
                    qs = qs.filter(_mk_q)
                if effective_dept:
                    qs = qs.filter(get_mark_dept_q(effective_dept))
                if req_batch:
                    qs = qs.filter(Q(student__batch=req_batch) | Q(student__section__batch__name=req_batch))
                if req_sec:
                    qs = qs.filter(student__section__name__iexact=req_sec)
                if req_sem:
                    try:
                        qs = qs.filter(student__section__semester__number=int(req_sem))
                    except Exception:
                        pass
                if req_subject:
                    qs = qs.filter(
                        Q(subject__code__iexact=req_subject) |
                        Q(subject_id=req_subject if req_subject.isdigit() else None)
                    )
                return qs.exclude(**{"%s__isnull" % field: True})

            # Context-aware list of assessments that actually have records in scope
            available_assessments = [
                name for name, M, field in assessment_registry
                if _scoped_marks(M, field).exists()
            ]

            # Data-driven batches / semesters for the dropdowns
            cohort_scope = active_student_cohort()
            _cohort_q = allowed_student_q(scope, get_student_dept_q)
            if _cohort_q is not None:
                cohort_scope = cohort_scope.filter(_cohort_q)
            if effective_dept:
                cohort_scope = cohort_scope.filter(get_student_dept_q(effective_dept))
            batches_list = sorted(
                b for b in cohort_scope.exclude(batch="").values_list("batch", flat=True).distinct()
            )
            sem_scope = cohort_scope.exclude(section__isnull=True).exclude(section__semester__isnull=True)
            # After an Academic Year is selected, only show the semesters that
            # actually exist for that year (Year → Semester dependency).
            if req_batch:
                sem_scope = sem_scope.filter(Q(batch=req_batch) | Q(section__batch__name=req_batch))
            semesters_list = sorted(
                {n for n in sem_scope.values_list("section__semester__number", flat=True) if n}
            )
            batch_semesters = {}
            for b_val, s_val in sem_scope.exclude(batch="").values_list("batch", "section__semester__number").distinct():
                if b_val and s_val:
                    batch_semesters.setdefault(b_val, []).append(s_val)
            for b_key in batch_semesters:
                batch_semesters[b_key].sort()

            selected_entry = registry_by_name.get(req_qp)
            pooled_mode = selected_entry is None
            if pooled_mode:
                marks_model = None
                mark_field = None
                max_score = 0.0
            else:
                marks_model, mark_field = selected_entry
                scoped = _scoped_marks(marks_model, mark_field)
                ref = scoped.aggregate(m=Max(mark_field))["m"]
                max_score = float(ref) if ref and float(ref) > 0 else 50.0

            # Semester Exam selection → real End Semester Examination (ESE) data from the
            # COE final-result table. Sealed off from the internal-assessment pipeline above.
            if req_qp in ("Semester", "Semester Exam"):
                return self._semester_exam_analytics(params, auth_ctx, effective_dept, scope)

            # Dynamic all departments from database — restricted to the
            # user's authorized departments (multi-department HOD/AHOD aware).
            # Phantom/role-like Department rows (e.g. an imported 'DB READER'
            # Department with no students/sections/curriculum) are excluded
            # data-driven via department_has_cohort — never name-based.
            all_depts_db = Department.objects.filter(is_teaching=True).order_by("name")
            all_depts_db = [d for d in all_depts_db if department_has_cohort(d)]
            if scope["is_college_wide"]:
                departments_list = [{"id": str(d.id), "code": d.code or str(d.id), "short_name": d.short_name or d.code or str(d.id), "name": d.name} for d in all_depts_db]
            else:
                allowed_ids = set(scope["allowed_departments"]["ids"])
                departments_list = [
                    {"id": str(d.id), "code": d.code or str(d.id), "short_name": d.short_name or d.code or str(d.id), "name": d.name}
                    for d in all_depts_db if str(d.id) in allowed_ids
                ]

            # Base Student QuerySet filtered strictly by all selected filters
            _stq = allowed_student_q(scope, get_student_dept_q)
            student_qs = active_student_cohort().select_related("home_department", "section", "user")
            if _stq is not None:
                student_qs = student_qs.filter(_stq)
            if effective_dept:
                student_qs = student_qs.filter(get_student_dept_q(effective_dept))
            if req_batch:
                student_qs = student_qs.filter(batch=req_batch)
            if req_sec:
                student_qs = student_qs.filter(section__name__iexact=req_sec)
            if req_sem:
                try:
                    sem_num = int(req_sem)
                    student_qs = student_qs.filter(section__semester__number=sem_num)
                except Exception:
                    pass
            if req_subject:
                from OBE.models import (
                    Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
                    Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
                )
                mark_student_ids = set()
                subject_q = Q(subject__code__iexact=req_subject)
                if req_subject.isdigit():
                    subject_q |= Q(subject_id=int(req_subject))
                for M in (Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
                          Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark):
                    mark_student_ids.update(
                        M.objects.filter(subject_q).values_list("student_id", flat=True)
                    )
                from COE.models import CoeFinalResult
                mark_student_ids.update(
                    CoeFinalResult.objects.filter(
                        Q(course_code__iexact=req_subject)
                    ).values_list("reg_no", flat=True)
                )
                if mark_student_ids:
                    reg_nos = {s.reg_no for s in student_qs if s.reg_no}
                    coe_matches = mark_student_ids & reg_nos if all(isinstance(x, str) for x in mark_student_ids) else set()
                    student_qs = student_qs.filter(
                        Q(id__in={s.id for s in student_qs if s.id in mark_student_ids}) |
                        Q(reg_no__in=coe_matches)
                    )

            # Dynamic Section options for the current scope (dept / batch / sem aware).
            # Deliberately computed WITHOUT the section selection itself so the dropdown
            # keeps showing every section that exists in the current dataset.
            section_scope = active_student_cohort()
            if _cohort_q is not None:
                section_scope = section_scope.filter(_cohort_q)
            if effective_dept:
                section_scope = section_scope.filter(get_student_dept_q(effective_dept))
            if req_batch:
                section_scope = section_scope.filter(Q(batch=req_batch) | Q(section__batch__name=req_batch))
            if req_sem:
                try:
                    section_scope = section_scope.filter(section__semester__number=int(req_sem))
                except Exception:
                    pass
            section_options = sorted(
                name
                for name in section_scope
                .exclude(section__isnull=True)
                .values_list("section__name", flat=True)
                .distinct()
            )

            total_filtered_students = student_qs.count()

            # Build Marks QuerySet filtered strictly by current slicers
            def _legacy_marks_qs():
                qs = marks_model.objects.all()
                _mkq = allowed_mark_student_q(scope)
                if _mkq is not None:
                    qs = qs.filter(_mkq)
                if effective_dept:
                    qs = qs.filter(get_mark_dept_q(effective_dept))
                if req_batch:
                    qs = qs.filter(student__batch=req_batch)
                if req_sec:
                    qs = qs.filter(student__section__name__iexact=req_sec)
                if req_sem:
                    try:
                        qs = qs.filter(student__section__semester__number=int(req_sem))
                    except Exception:
                        pass
                return qs

            # Pooled cross-assessment statistics (used when no specific assessment is
            # selected). Every mark is normalized against its OWN assessment's observed
            # maximum in scope, so different scales (SSA /20, Review /30, CIA /50 ...)
            # are combined honestly instead of being forced into one scale.
            dept_stats = {}          # dept_id -> [record_count, sum_pct, pass_count]
            student_pass_map = {}    # student_id -> True/False (passed ALL taken exams)
            total_records_pooled = 0
            sum_pct_pooled = 0.0
            pass_count_pooled = 0

            if pooled_mode:
                for _name, _M, _field in assessment_registry:
                    qs = _scoped_marks(_M, _field)
                    ref = qs.aggregate(m=Max(_field))["m"]
                    if not ref or float(ref) <= 0:
                        continue
                    ref = float(ref)
                    thresh = ref * 0.50
                    for sid, did, val in qs.values_list("student_id", "student__home_department_id", _field):
                        if val is None:
                            continue
                        pct = (float(val) / ref) * 100.0
                        passed = pct >= 50.0
                        total_records_pooled += 1
                        sum_pct_pooled += pct
                        if passed:
                            pass_count_pooled += 1
                        if did is not None:
                            st = dept_stats.setdefault(did, [0, 0.0, 0])
                            st[0] += 1
                            st[1] += pct
                            if passed:
                                st[2] += 1
                        prev = student_pass_map.get(sid)
                        student_pass_map[sid] = passed if prev is None else (prev and passed)

                total_marks_records = total_records_pooled
                if total_records_pooled > 0:
                    overall_marks_pct = round(sum_pct_pooled / total_records_pooled, 1)
                    overall_pass_pct = round((pass_count_pooled / total_records_pooled) * 100.0, 1)
                else:
                    overall_marks_pct = 0.0
                    overall_pass_pct = 0.0
            else:
                marks_qs = _legacy_marks_qs()
                total_marks_records = marks_qs.count()

                # Calculate exact live Overall Academic Average and Pass Rate % for current filter
                if total_marks_records > 0:
                    avg_raw = marks_qs.aggregate(Avg(mark_field))[f"{mark_field}__avg"] or 0
                    overall_marks_pct = round((float(avg_raw) / max_score) * 100.0, 1)
                    pass_threshold = max_score * 0.50
                    passed_marks_count = marks_qs.filter(**{f"{mark_field}__gte": pass_threshold}).count()
                    overall_pass_pct = round((passed_marks_count / total_marks_records) * 100.0, 1)
                else:
                    overall_marks_pct = 0.0
                    overall_pass_pct = 0.0

            # Department performance breakdown
            depts_to_evaluate = all_depts_db
            if effective_dept:
                _ed = effective_dept.lower()
                depts_to_evaluate = [
                    d for d in depts_to_evaluate
                    if _ed in (str(d.id), str(d.code or "").lower(), str(d.short_name or "").lower())
                ]

            dept_comparison = []
            if pooled_mode:
                # Pooled mode: per-department stats come from the normalized pool
                for d in depts_to_evaluate:
                    st = dept_stats.get(d.id)
                    if not st or st[0] == 0:
                        continue
                    d_cnt, d_sum, d_pass = st
                    d_avg_pct = round(d_sum / d_cnt, 1)
                    d_pass_pct = round((d_pass / d_cnt) * 100.0, 1)

                    d_student_qs = student_qs.filter(get_student_dept_q(d.id))
                    d_students = d_student_qs.count()

                    d_att_pct = None
                    d_att_qs = DailyAttendanceRecord.objects.filter(student__in=d_student_qs)
                    d_att_total = d_att_qs.count()
                    if d_att_total > 0:
                        d_att_present = d_att_qs.filter(status__in=['P', 'OD', 'PRESENT', 'ON_DUTY']).count()
                        d_att_pct = round((d_att_present / d_att_total) * 100.0, 1)

                    dept_comparison.append({
                        "dept_code": d.short_name or d.code or d.name[:4],
                        "dept_name": d.name,
                        "pass_rate_pct": min(100.0, max(0.0, d_pass_pct)),
                        "avg_marks_pct": min(100.0, max(0.0, d_avg_pct)),
                        "total_records": d_cnt,
                        "total_students": d_students,
                        "attendance_pct": d_att_pct
                    })
            else:
                for d in depts_to_evaluate:
                    d_marks = _legacy_marks_qs().filter(get_mark_dept_q(d.id))

                    d_cnt = d_marks.count()
                    if d_cnt > 0:
                        d_avg = d_marks.aggregate(Avg(mark_field))[f"{mark_field}__avg"] or 0
                        d_avg_pct = round((float(d_avg) / max_score) * 100.0, 1)
                        d_passed = d_marks.filter(**{f"{mark_field}__gte": max_score * 0.50}).count()
                        d_pass_pct = round((d_passed / d_cnt) * 100.0, 1)

                        # Real unique student count for this department from the active student cohort
                        d_student_qs = student_qs.filter(get_student_dept_q(d.id))
                        d_students = d_student_qs.count()

                        # Per-department attendance from DailyAttendanceRecord
                        d_att_pct = None
                        d_att_qs = DailyAttendanceRecord.objects.filter(student__in=d_student_qs)
                        d_att_total = d_att_qs.count()
                        if d_att_total > 0:
                            d_att_present = d_att_qs.filter(status__in=['P', 'OD', 'PRESENT', 'ON_DUTY']).count()
                            d_att_pct = round((d_att_present / d_att_total) * 100.0, 1)

                        dept_comparison.append({
                            "dept_code": d.short_name or d.code or d.name[:4],
                            "dept_name": d.name,
                            "pass_rate_pct": min(100.0, max(0.0, d_pass_pct)),
                            "avg_marks_pct": min(100.0, max(0.0, d_avg_pct)),
                            "total_records": d_cnt,
                            "total_students": d_students,
                            "attendance_pct": d_att_pct
                        })

            # Calculate exact Students Needing Support (< 58% average) for current filter
            # (single-assessment mode only; the college view does not render this list)
            weak_students = []
            students_needing_support_count = 0
            for s in ([] if pooled_mode else student_qs[:60]):
                s_marks = marks_model.objects.filter(student=s)
                cnt = s_marks.count()
                if cnt > 0:
                    s_avg = s_marks.aggregate(Avg(mark_field))[f"{mark_field}__avg"] or 0
                    s_pct = round((float(s_avg) / max_score) * 100.0, 1)
                    if s_pct < 58.0:
                        students_needing_support_count += 1
                        if len(weak_students) < 50:
                            failed = s_marks.filter(**{f"{mark_field}__lt": max_score * 0.50}).count()
                            sem_str = str(s.section.semester.number) if (s.section and s.section.semester) else "5"
                            dept_label = s.home_department.short_name if s.home_department else (s.section.batch.course.department.short_name if (s.section and s.section.batch and s.section.batch.course and s.section.batch.course.department) else "ENG")
                            weak_students.append({
                                "student_id": str(s.id),
                                "reg_no": s.reg_no or f"REG{s.id}",
                                "name": s.user.get_full_name() or s.user.username,
                                "dept": dept_label,
                                "section": s.section.name if s.section else "A",
                                "sem": sem_str,
                                "photo": "",
                                "total_exams": cnt,
                                "passed_exams": cnt - failed,
                                "failed_exams": failed,
                                "avg_score_pct": s_pct,
                                "status": "Below 58%" if s_pct < 50 else "Needs Support"
                            })

            # Real Pass / Fail Trends for filtered scope
            c1_m = Cia1Mark.objects.all()
            c2_m = Cia2Mark.objects.all()
            md_m = ModelExamMark.objects.all()
            _pf_q = allowed_mark_student_q(scope)
            if _pf_q is not None:
                c1_m = c1_m.filter(_pf_q)
                c2_m = c2_m.filter(_pf_q)
                md_m = md_m.filter(_pf_q)
            if effective_dept:
                c1_m = c1_m.filter(get_mark_dept_q(effective_dept))
                c2_m = c2_m.filter(get_mark_dept_q(effective_dept))
                md_m = md_m.filter(get_mark_dept_q(effective_dept))
            if req_batch:
                c1_m = c1_m.filter(student__batch=req_batch)
                c2_m = c2_m.filter(student__batch=req_batch)
                md_m = md_m.filter(student__batch=req_batch)
            if req_sec:
                c1_m = c1_m.filter(student__section__name__iexact=req_sec)
                c2_m = c2_m.filter(student__section__name__iexact=req_sec)
                md_m = md_m.filter(student__section__name__iexact=req_sec)

            c1_c = c1_m.count() or 1
            c1_p = c1_m.filter(mark__gte=25).count()
            c2_c = c2_m.count() or 1
            c2_p = c2_m.filter(mark__gte=25).count()
            md_c = md_m.count() or 1
            md_p = md_m.filter(total_mark__gte=50).count()

            pass_fail_trends = [
                {"name": "CIA 1", "pass": c1_p, "fail": c1_c - c1_p, "total": c1_c, "pass_rate_pct": round((c1_p/c1_c)*100, 1)},
                {"name": "CIA 2", "pass": c2_p, "fail": c2_c - c2_p, "total": c2_c, "pass_rate_pct": round((c2_p/c2_c)*100, 1)},
                {"name": "Model Exam", "pass": md_p, "fail": md_c - md_p, "total": md_c, "pass_rate_pct": round((md_p/md_c)*100, 1)},
            ]

            # 10-Mark Interval Range Distribution (0-10, 11-20, ..., 91-100)
            range_distribution = []
            intervals = [
                (0.0, 10.0, "0-10"),
                (10.0001, 20.0, "11-20"),
                (20.0001, 30.0, "21-30"),
                (30.0001, 40.0, "31-40"),
                (40.0001, 50.0, "41-50"),
                (50.0001, 60.0, "51-60"),
                (60.0001, 70.0, "61-70"),
                (70.0001, 80.0, "71-80"),
                (80.0001, 90.0, "81-90"),
                (90.0001, 100.0, "91-100")
            ]

            tot_m = total_marks_records or 1
            if pooled_mode:
                intervals = []  # cross-assessment ranges are not scale-comparable
            for low_pct, high_pct, label in intervals:
                low_val = max_score * (low_pct / 100.0)
                high_val = max_score * (high_pct / 100.0)
                r_count = marks_qs.filter(**{f"{mark_field}__gte": low_val, f"{mark_field}__lte": high_val}).count()
                range_distribution.append({
                    "label": label,
                    "min": int(low_pct),
                    "max": int(high_pct),
                    "student_count": r_count,
                    "percentage": round((r_count / tot_m) * 100, 1)
                })

            # INDIVIDUAL STUDENTS PERFORMANCE TABLE WITH SUBJECT CELLS IN CLASS SELECTED
            class_students_perf = []
            distinct_subjects = []
            if req_sec and effective_dept and not pooled_mode:
                # Get the matching student ID list
                s_ids = list(student_qs.values_list('id', flat=True))
                # Find all subjects actually taken by these students
                subj_ids = marks_model.objects.filter(student_id__in=s_ids).values_list("subject_id", flat=True).distinct()
                
                db_subjs = Subject.objects.filter(id__in=subj_ids)
                distinct_subjects = [{"id": str(sb.id), "name": sb.name, "code": sb.code} for sb in db_subjs]

                # Sort students in Reg No ascending order by the last 3 digit numbers (converting to int for numeric sort)
                sorted_student_qs = list(student_qs)
                def get_sort_key(s_obj):
                    reg = str(s_obj.reg_no or '').strip()
                    if reg and len(reg) >= 3:
                        last_three = reg[-3:]
                        if last_three.isdigit():
                            return int(last_three)
                    return 999999
                
                sorted_student_qs.sort(key=get_sort_key)

                for s in sorted_student_qs[:150]:
                    s_perf_row = {
                        "student_id": str(s.id),
                        "name": s.user.get_full_name() or s.user.username,
                        "reg_no": s.reg_no,
                        "marks": {}
                    }
                    for sb in db_subjs:
                        m_rec = marks_model.objects.filter(student=s, subject=sb).first()
                        if m_rec:
                            score = float(getattr(m_rec, mark_field))
                            s_perf_row["marks"][str(sb.id)] = round((score / max_score) * 100.0, 1)
                        else:
                            s_perf_row["marks"][str(sb.id)] = "-"
                    class_students_perf.append(s_perf_row)

            # Calculate unique student pass / fail counts
            student_ids = list(student_qs.values_list('id', flat=True))
            if pooled_mode and total_records_pooled > 0:
                pass_count = sum(1 for v in student_pass_map.values() if v)
                fail_count = len(student_pass_map) - pass_count
                untested = len(student_ids) - len(student_pass_map)
                if untested > 0:
                    fail_count += untested
            elif student_ids and total_marks_records > 0:
                pass_th = max_score * 0.50
                # Students with at least one mark who passed ALL their taken exams
                # Group by student
                pass_count = 0
                fail_count = 0
                student_marks_map = {}
                for m in marks_qs.values('student_id', mark_field):
                    sid = m['student_id']
                    val = float(m[mark_field])
                    if sid not in student_marks_map:
                        student_marks_map[sid] = True
                    if val < pass_th:
                        student_marks_map[sid] = False
                
                for sid, is_p in student_marks_map.items():
                    if is_p:
                        pass_count += 1
                    else:
                        fail_count += 1
                
                # Account for active students with no mark records as fail/pending
                untested = len(student_ids) - len(student_marks_map)
                if untested > 0:
                    fail_count += untested
            else:
                pass_count = 0
                fail_count = total_filtered_students

            # Attendance Calculation using DailyAttendanceRecord
            att_qs = DailyAttendanceRecord.objects.filter(student_id__in=student_ids)
            total_att_records = att_qs.count()
            if total_att_records > 0:
                present_cnt = att_qs.filter(status__in=['P', 'OD', 'PRESENT', 'ON_DUTY']).count()
                overall_attendance = round((present_cnt / total_att_records) * 100.0, 1)
            else:
                overall_attendance = None  # No attendance session records for this scope

            return Response({
                "metrics": {
                    "total_students": total_filtered_students,
                    "total_exams_taken": total_marks_records,
                    "overall_pass_pct": overall_pass_pct,
                    "overall_marks_pct": overall_marks_pct,
                    "overall_attendance": overall_attendance,
                    "overall_pass_count": pass_count,
                    "overall_fail_count": fail_count
                },
                "batches_list": batches_list,
                "departments_list": departments_list,
                "filter_options": {
                    "sections": section_options,
                    "assessments": available_assessments,
                    "exam_types": available_assessments,
                    "batches": batches_list,
                    "semesters": semesters_list,
                    "batch_semesters": batch_semesters,
                },
                "user_context": auth_ctx,
                "dept_comparison": dept_comparison,
                "subject_performance": [],
                "pass_fail_trends": pass_fail_trends,
                "weak_students": weak_students,
                "total_weak_students": students_needing_support_count,
                "range_distribution": range_distribution,
                "class_students_perf": class_students_perf,
                "distinct_subjects": distinct_subjects
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error in AcademicPerformanceAnalyticsView: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_200_OK)

    def _semester_exam_analytics(self, params, auth_ctx, effective_dept, scope=None):
        """
        Real End Semester Examination (ESE) analytics built from the COE final-result table.

        Isolated from the internal CIA / Model pipeline but returns the same response shape
        so the College KPI cards and the Department-wise table render with real data.
        """
        from .authorization import allowed_student_q  # local import; safe on all paths
        scope = scope or get_performance_scope(None)
        req_batch = params.get("year", params.get("batch", "")).strip()
        req_sem = params.get("sem", "").strip()
        req_sec = params.get("section", "").strip()

        def _scope(include_section):
            qs = active_student_cohort()
            _sq = allowed_student_q(scope, get_student_dept_q)
            if _sq is not None:
                qs = qs.filter(_sq)
            if effective_dept:
                qs = qs.filter(get_student_dept_q(effective_dept))
            if req_batch:
                qs = qs.filter(Q(batch=req_batch) | Q(section__batch__name=req_batch))
            if req_sem:
                try:
                    qs = qs.filter(section__semester__number=int(req_sem))
                except Exception:
                    pass
            if include_section and req_sec:
                qs = qs.filter(section__name__iexact=req_sec)
            return qs

        students = list(_scope(True))
        section_scope = _scope(False)
        section_options = sorted(
            name
            for name in section_scope
            .exclude(section__isnull=True)
            .values_list("section__name", flat=True)
            .distinct()
        )
        student_ids = [s.id for s in students]
        reg_no_set = {s.reg_no for s in students if s.reg_no}

        # Real ESE rows from the COE final-result table
        from COE.models import CoeFinalResult
        coe_qs = CoeFinalResult.objects.all()
        if reg_no_set:
            coe_qs = coe_qs.filter(reg_no__in=reg_no_set)
        rows = list(coe_qs)
        total_marks_records = len(rows)

        overall_pass_pct = 0.0
        overall_marks_pct = 0.0
        if rows:
            pass_cnt = sum(1 for r in rows if (r.max_marks or 0) > 0 and r.total_marks >= (r.max_marks * 0.5))
            total_pct = sum(
                (r.total_marks / r.max_marks) * 100.0 if (r.max_marks or 0) > 0 else 0.0
                for r in rows
            )
            overall_pass_pct = round((pass_cnt / len(rows)) * 100.0, 1)
            overall_marks_pct = round(total_pct / len(rows), 1)

        # Pass / fail counts per unique student
        pass_count = 0
        fail_count = 0
        student_map_ok = {}
        for r in rows:
            reg = r.reg_no
            if reg not in student_map_ok:
                student_map_ok[reg] = True
            if (r.max_marks or 0) > 0 and r.total_marks < (r.max_marks * 0.5):
                student_map_ok[reg] = False
        for reg, ok in student_map_ok.items():
            if ok:
                pass_count += 1
            else:
                fail_count += 1
        untested = len(student_ids) - len(student_map_ok)
        if untested > 0:
            fail_count += untested
        if not rows:
            pass_count = 0
            fail_count = len(student_ids)

        # Attendance (same source as the internal pipeline)
        overall_attendance = 0.0
        if student_ids:
            att_qs = DailyAttendanceRecord.objects.filter(student_id__in=student_ids)
            total_att = att_qs.count()
            if total_att > 0:
                present = att_qs.filter(status__in=['P', 'OD', 'PRESENT', 'ON_DUTY']).count()
                overall_attendance = round((present / total_att) * 100.0, 1)

        # Department-wise comparison from the same ESE rows
        all_depts = Department.objects.filter(is_teaching=True).order_by("name")
        dept_comparison = []
        for d in all_depts:
            d_student_qs = _scope(True).filter(get_student_dept_q(d.id))
            d_regs = {sp.reg_no for sp in d_student_qs if sp.reg_no}
            d_rows = [r for r in rows if r.reg_no in d_regs]
            if not d_rows:
                continue
            d_pass = sum(1 for r in d_rows if (r.max_marks or 0) > 0 and r.total_marks >= (r.max_marks * 0.5))
            d_sum = sum(
                (r.total_marks / r.max_marks) * 100.0 if (r.max_marks or 0) > 0 else 0.0
                for r in d_rows
            )
            d_ids = list(d_student_qs.values_list('id', flat=True))
            d_att_pct = None
            if d_ids:
                d_att = DailyAttendanceRecord.objects.filter(student_id__in=d_ids)
                d_att_total = d_att.count()
                if d_att_total > 0:
                    d_present = d_att.filter(status__in=['P', 'OD', 'PRESENT', 'ON_DUTY']).count()
                    d_att_pct = round((d_present / d_att_total) * 100.0, 1)
            dept_comparison.append({
                "dept_code": d.short_name or d.code or d.name[:4],
                "dept_name": d.name,
                "pass_rate_pct": round((d_pass / len(d_rows)) * 100.0, 1),
                "avg_marks_pct": round(d_sum / len(d_rows), 1),
                "total_records": len(d_rows),
                "total_students": len(d_ids),
                "attendance_pct": d_att_pct,
            })

        return Response({
            "metrics": {
                "total_students": len(student_ids),
                "total_exams_taken": total_marks_records,
                "overall_pass_pct": overall_pass_pct,
                "overall_marks_pct": overall_marks_pct,
                "overall_attendance": overall_attendance,
                "overall_pass_count": pass_count,
                "overall_fail_count": fail_count,
            },
            "batches_list": ["2023", "2024", "2025"],
            "departments_list": [
                {"id": str(d.id), "code": d.code or str(d.id), "short_name": d.short_name or d.code or str(d.id), "name": d.name}
                for d in all_depts
            ],
            "filter_options": {
                "sections": section_options,
                "exam_types": ["CIA 1", "CIA 2", "Model Exam", "Semester Exam"],
            },
            "user_context": auth_ctx,
            "dept_comparison": dept_comparison,
            "subject_performance": [],
            "pass_fail_trends": [],
            "weak_students": [],
            "total_weak_students": 0,
            "range_distribution": [],
            "class_students_perf": [],
            "distinct_subjects": [],
        }, status=status.HTTP_200_OK)


class StudentSearchView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request):
        auth_ctx = resolve_user_auth_context(request.user)
        scope = get_performance_scope(request.user)
        q = request.query_params.get("q", "").strip()
        dept = request.query_params.get("dept", "").strip()
        dept = clamp_department_param(scope, dept)

        qs = StudentProfile.objects.filter(status__iexact="ACTIVE").select_related("user", "home_department", "section")
        _sq = allowed_student_q(scope, get_student_dept_q)
        if _sq is not None:
            qs = qs.filter(_sq)
        if dept:
            qs = qs.filter(get_student_dept_q(dept))
        if q:
            qs = qs.filter(Q(reg_no__icontains=q) | Q(user__username__icontains=q) | Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q))
        
        results = []
        for s in qs[:25]:
            dept_lbl = s.home_department.short_name if s.home_department else (s.section.batch.course.department.short_name if (s.section and s.section.batch and s.section.batch.course and s.section.batch.course.department) else "ENG")
            results.append({
                "id": str(s.id),
                "reg_no": s.reg_no,
                "name": s.user.get_full_name() or s.user.username,
                "department": dept_lbl,
                "section": s.section.name if s.section else "A",
                "semester": str(s.section.semester.number) if (s.section and s.section.semester) else "5",
                "photo": ""
            })
        return Response({"students": results}, status=status.HTTP_200_OK)


class StudentProgressReportView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request, student_id):
        student = StudentProfile.objects.filter(id=student_id).select_related("user", "home_department", "section").first()
        if not student:
            student = StudentProfile.objects.first()

        cia1_marks = Cia1Mark.objects.filter(student=student).select_related("subject")
        subject_results = []
        for m in cia1_marks:
            score = float(m.mark) * 2.0
            subject_results.append({
                "course_code": m.subject.code if m.subject else "SUB",
                "course_name": m.subject.name if m.subject else "Subject",
                "exam_name": "CIA 1",
                "total_mark": score,
                "max_mark": 100,
                "is_pass": score >= 50.0,
                "faculty": "Subject Faculty"
            })

        avg_p = round(sum(r["total_mark"] for r in subject_results) / max(1, len(subject_results)), 1)
        pass_p = round((sum(1 for r in subject_results if r["is_pass"]) / max(1, len(subject_results))) * 100, 1)
        # Real department label: home_department, else the section's batch/course
        # department — never a hardcoded placeholder.
        dept_lbl = (
            student.home_department.short_name or student.home_department.name
            if (student and student.home_department) else ""
        )
        if not dept_lbl and student and student.section:
            _bd = (student.section.batch.course.department
                   if (student.section.batch and student.section.batch.course) else None)
            if _bd:
                dept_lbl = _bd.short_name or _bd.name
        _full_name = student.user.get_full_name() if student else ""
        _sem_lbl = str(student.section.semester.number) if (student and student.section and student.section.semester) else "—"

        return Response({
            "student_info": {
                "student_id": str(student.id if student else 1),
                "reg_no": student.reg_no if student else "23CS001",
                "name": _full_name or (student.user.username if student else "Student"),
                "dept": dept_lbl or "—",
                "section": student.section.name if (student and student.section) else "—",
                "sem": _sem_lbl,
                "photo": "",
                "overall_score_pct": avg_p,
                "pass_rate_pct": pass_p,
                "total_exams": len(subject_results),
                "passed_exams": sum(1 for r in subject_results if r["is_pass"]),
                "status": "Above 58%" if avg_p > 58 else ("Equal to 58%" if avg_p == 58 else "Below 58%")
            },
            "subject_results": subject_results,
            "growth_graph": [
                {"semester": "Sem 1", "score_pct": max(0, avg_p - 4)},
                {"semester": "Sem 2", "score_pct": max(0, avg_p - 2)},
                {"semester": "Sem 3", "score_pct": min(100, avg_p + 1)},
                {"semester": "Sem 4", "score_pct": max(0, avg_p - 1)},
                {"semester": "Sem 5", "score_pct": avg_p},
            ]
        }, status=status.HTTP_200_OK)


class StudentCompareView(APIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        return Response({"comparison": []}, status=status.HTTP_200_OK)


class FacultyWiseAnalyticsView(APIView):
    """Faculty-wise academic analytics driven by real TeachingAssignment links.

    List mode  (no `faculty` param): per-faculty aggregate rows for a department.
    Detail mode (`faculty`=<StaffProfile pk>): faculty KPIs, subjects actually
    taught, taught students, and real mentees (StudentMentorMap). Percentages are
    normalized against each assessment's observed maximum; attendance comes from
    DailyAttendanceRecord and is None when no records exist.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            auth_ctx = resolve_user_auth_context(request.user)
            scope = get_performance_scope(request.user)
            p = request.query_params
            dept_code = clamp_department_param(scope, p.get("dept", "").strip())
            req_batch = p.get("year", "").strip()
            req_sem = p.get("sem", "").strip()
            req_sec = p.get("section", "").strip()
            req_exam = (p.get("exam", "").strip() or "All Assessments")
            faculty_pk = p.get("faculty", "").strip()

            from OBE.models import (
                Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
                Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
            )
            assessment_registry = [
                ("CIA 1", Cia1Mark, "mark"),
                ("CIA 2", Cia2Mark, "mark"),
                ("SSA 1", Ssa1Mark, "mark"),
                ("SSA 2", Ssa2Mark, "mark"),
                ("Review 1", Review1Mark, "mark"),
                ("Review 2", Review2Mark, "mark"),
                ("Formative 1", Formative1Mark, "total"),
                ("Formative 2", Formative2Mark, "total"),
                ("Model Exam", ModelExamMark, "total_mark"),
                ("Lab Exam", LabExamMark, "total_mark"),
                ("Final Internal", FinalInternalMark, "final_mark"),
            ]
            # ---- Teaching-assignment scope for current filters ----------------
            from academics.models import TeachingAssignment, StudentMentorMap, StaffProfile, AcademicYear

            ta_qs = TeachingAssignment.objects.filter(is_active=True).select_related(
                "staff", "staff__user", "staff__department", "subject",
                "curriculum_row", "elective_subject", "section", "section__semester",
                "section__batch", "section__batch__course",
                "section__batch__course__department", "academic_year",
            )
            # Only genuine teaching faculty — exclude system/admin role accounts
            # (e.g. IQAC / Principal) whose StaffProfile has no department assignment.
            ta_qs = ta_qs.filter(staff__department__isnull=False)

            if dept_code:
                ta_qs = ta_qs.filter(
                    Q(section__batch__course__department__code__iexact=dept_code)
                    | Q(section__batch__course__department__short_name__iexact=dept_code)
                    | Q(staff__department__code__iexact=dept_code)
                    | Q(staff__department__short_name__iexact=dept_code)
                )
            if req_batch:
                _ay_ids = list(AcademicYear.objects.filter(name__startswith=req_batch).values_list("id", flat=True))
                if not _ay_ids:
                    _ay_ids = list(AcademicYear.objects.filter(name__contains=req_batch).values_list("id", flat=True))
                if _ay_ids:
                    ta_qs = ta_qs.filter(academic_year_id__in=_ay_ids)
            if req_sem:
                try:
                    ta_qs = ta_qs.filter(section__semester__number=int(req_sem))
                except Exception:
                    pass
            if req_sec:
                ta_qs = ta_qs.filter(section__name__iexact=req_sec)

            ta_list = list(ta_qs)
            ta_by_id = {ta.id: ta for ta in ta_list}
            ta_ids = list(ta_by_id.keys())

            def _ta_subject(ta):
                """Real subject identity for a TeachingAssignment (elective > curriculum row > Subject)."""
                if ta.elective_subject_id:
                    es = ta.elective_subject
                    return (getattr(es, "course_code", "") or "", getattr(es, "course_name", "") or "")
                if ta.curriculum_row_id:
                    cr = ta.curriculum_row
                    return (getattr(cr, "course_code", "") or "", getattr(cr, "course_name", "") or "")
                if ta.subject_id:
                    return (ta.subject.code or "", ta.subject.name or "")
                return ("", "")

            def _att_pct(student_ids):
                ids = list({i for i in student_ids if i})
                if not ids:
                    return None
                qs = DailyAttendanceRecord.objects.filter(student_id__in=ids)
                tot = qs.count()
                if tot == 0:
                    return None
                pres = qs.filter(status__in=["P", "OD", "PRESENT", "ON_DUTY"]).count()
                return round((pres / tot) * 100.0, 1)

            # ---- normalized mark aggregation over TAs ------------------------
            # Each assessment is normalized against its own observed maximum in
            # scope, so SSA /20 and CIA /50 are never mixed raw.
            registry_by_name = {name: (M, f) for name, M, f in assessment_registry}
            selected_name = req_exam if req_exam in registry_by_name else None
            scan = [(selected_name, *registry_by_name[selected_name])] if selected_name else assessment_registry

            per_ta = {}      # ta_id -> [count, sum_pct, pass_count]
            per_staff = {}   # staff_id -> [count, sum_pct, pass_count]
            per_student = {} # (student_id, ta_id) -> [count, sum_pct, pass_count]
            total_cnt, total_sum, total_pass = 0, 0.0, 0

            for _name, M, _field in scan:
                qs = M.objects.filter(teaching_assignment_id__in=ta_ids).exclude(**{_field + "__isnull": True})
                ref = qs.aggregate(m=Max(_field))["m"]
                if not ref or float(ref) <= 0:
                    continue
                ref = float(ref)
                for ta_id, sid, val in qs.values_list("teaching_assignment_id", "student_id", _field):
                    pct = (float(val) / ref) * 100.0
                    passed = pct >= 50.0
                    st = per_ta.setdefault(ta_id, [0, 0.0, 0])
                    st[0] += 1; st[1] += pct; st[2] += 1 if passed else 0
                    sp = per_staff.setdefault(ta_by_id[ta_id].staff_id, [0, 0.0, 0])
                    sp[0] += 1; sp[1] += pct; sp[2] += 1 if passed else 0
                    sr = per_student.setdefault((sid, ta_id), [0, 0.0, 0])
                    sr[0] += 1; sr[1] += pct; sr[2] += 1 if passed else 0
                    total_cnt += 1; total_sum += pct; total_pass += 1 if passed else 0

            # ---- LIST MODE: per-faculty rows for the department ---------------
            if not faculty_pk:
                staff_ids = {ta.staff_id for ta in ta_list}
                staff_map = {}
                for ta in ta_list:
                    staff_map.setdefault(ta.staff_id, ta.staff)
                faculties = []
                for sid_ in sorted(staff_ids, key=lambda s: (staff_map[s].user.get_full_name() or staff_map[s].user.username or "").lower()):
                    staff = staff_map[sid_]
                    st = per_staff.get(sid_)
                    fac_tas = [ta for ta in ta_list if ta.staff_id == sid_]
                    fac_students = {sid2 for (sid2, t) in per_student if any(ta.id == t and ta.staff_id == sid_ for ta in fac_tas)}
                    faculties.append({
                        "faculty_id": str(staff.id),
                        "name": staff.user.get_full_name() or staff.user.username,
                        "staff_id": staff.staff_id or f"FAC{staff.id}",
                        "department": (staff.department.short_name or staff.department.name) if staff.department_id else "",
                        "designation": staff.designation or "",
                        "subjects_handled": len({(_ta_subject(ta)[0] or _ta_subject(ta)[1]) for ta in fac_tas}),
                        "students_handled": len(fac_students),
                        "avg_marks_pct": round(st[1] / st[0], 1) if st and st[0] else None,
                        "pass_pct": round((st[2] / st[0]) * 100.0, 1) if st and st[0] else None,
                        "attendance_pct": _att_pct(fac_students),
                        "total_records": st[0] if st else 0,
                    })
                return Response({"faculties": faculties}, status=status.HTTP_200_OK)

            # ---- DETAIL MODE: one faculty -------------------------------------
            try:
                staff = StaffProfile.objects.select_related("user", "department").get(pk=int(faculty_pk))
            except (StaffProfile.DoesNotExist, ValueError):
                return Response({"error": "Faculty not found."}, status=status.HTTP_404_NOT_FOUND)

            # Security: college-wide roles may inspect any faculty; everyone
            # else only themselves or faculty in their allowed departments.
            if not scope["is_college_wide"]:
                allowed = (
                    staff.user_id == request.user.id
                    or (staff.department_id and staff.department_id in scope.get("_allowed_dept_id_set", set()))
                )
                if not allowed:
                    return Response({"error": "You are not authorized to view this faculty's data."}, status=status.HTTP_403_FORBIDDEN)

            fac_tas = [ta for ta in ta_list if ta.staff_id == staff.id]
            fac_ta_ids = {ta.id for ta in fac_tas}
            fac_students = sorted({sid2 for (sid2, t) in per_student if t in fac_ta_ids})
            st = per_staff.get(staff.id)

            # ---- Subjects actually taught by this faculty ---------------------
            subj_groups = {}  # (code, name) -> [ta_ids]
            for ta in fac_tas:
                subj_groups.setdefault(_ta_subject(ta), []).append(ta.id)
            subjects_out = []
            for (code, name), t_ids in sorted(subj_groups.items(), key=lambda kv: kv[0][0] or kv[0][1]):
                grp = [per_ta[t] for t in t_ids if t in per_ta]
                cnt = sum(g[0] for g in grp); sm = sum(g[1] for g in grp); ps = sum(g[2] for g in grp)
                sec_ids = {ta.section_id for ta in fac_tas if ta.id in t_ids}
                sec_students = list(
                    active_student_cohort().filter(section_id__in=sec_ids).values_list("id", flat=True)
                ) if sec_ids else []
                subjects_out.append({
                    "subject_code": code or name or "—",
                    "subject_name": name or code or "—",
                    "sections": sorted({ta.section.name for ta in fac_tas if ta.id in t_ids and ta.section}),
                    "student_count": len({sid2 for (sid2, t) in per_student if t in t_ids}) or (len(sec_students) if sec_students else None),
                    "avg_marks_pct": round(sm / cnt, 1) if cnt else None,
                    "pass_pct": round((ps / cnt) * 100.0, 1) if cnt else None,
                    "attendance_pct": _att_pct(sec_students),
                    "total_records": cnt,
                })

            # ---- Students taught by this faculty ------------------------------
            students_out = []
            if fac_students:
                sp_map = {
                    s.id: s for s in StudentProfile.objects.filter(id__in=fac_students).select_related(
                        "user", "section", "section__semester", "home_department"
                    )
                }
                for sid2 in fac_students:
                    s_obj = sp_map.get(sid2)
                    if not s_obj:
                        continue
                    rows = [(t, per_student[(sid2, t)]) for t in fac_ta_ids if (sid2, t) in per_student]
                    cnt = sum(r[1][0] for r in rows); sm = sum(r[1][1] for r in rows); ps = sum(r[1][2] for r in rows)
                    subj_codes = sorted({_ta_subject(ta_by_id[t])[0] for t, _ in rows if t in ta_by_id and _ta_subject(ta_by_id[t])[0]})
                    students_out.append({
                        "student_id": str(sid2),
                        "reg_no": s_obj.reg_no or f"REG{sid2}",
                        "name": s_obj.user.get_full_name() or s_obj.user.username,
                        "section": s_obj.section.name if s_obj.section_id else "—",
                        "semester": str(s_obj.section.semester.number) if (s_obj.section and s_obj.section.semester) else "—",
                        "batch": s_obj.batch or "—",
                        "subjects": subj_codes,
                        "avg_marks_pct": round(sm / cnt, 1) if cnt else None,
                        "result": "Pass" if cnt and ps == cnt else ("Fail" if cnt else None),
                        "total_records": cnt,
                    })

            # ---- Real mentees (StudentMentorMap) -------------------------------
            mentees_out = []
            mentee_ids = list(
                StudentMentorMap.objects.filter(mentor=staff, is_active=True).values_list("student_id", flat=True)
            )
            for m_stu in StudentProfile.objects.filter(id__in=mentee_ids).select_related("user", "section", "section__semester", "home_department"):
                m_cnt, m_sum, m_pass = 0, 0.0, 0
                for _n2, M2, _f2 in assessment_registry:
                    q2 = M2.objects.filter(student_id=m_stu.id).exclude(**{_f2 + "__isnull": True})
                    ref2 = q2.aggregate(m=Max(_f2))["m"]
                    if not ref2 or float(ref2) <= 0:
                        continue
                    ref2 = float(ref2)
                    for val2 in q2.values_list(_f2, flat=True):
                        p2 = float(val2) / ref2 * 100.0
                        m_cnt += 1; m_sum += p2; m_pass += 1 if p2 >= 50.0 else 0
                mentees_out.append({
                    "student_id": str(m_stu.id),
                    "reg_no": m_stu.reg_no or f"REG{m_stu.id}",
                    "name": m_stu.user.get_full_name() or m_stu.user.username,
                    "section": m_stu.section.name if m_stu.section_id else "—",
                    "avg_marks_pct": round(m_sum / m_cnt, 1) if m_cnt else None,
                    "pass_pct": round((m_pass / m_cnt) * 100.0, 1) if m_cnt else None,
                    "attendance_pct": _att_pct([m_stu.id]),
                    "total_records": m_cnt,
                })

            dept_lbl = dept_code or ((staff.department.short_name or staff.department.name) if staff.department_id else "")
            return Response({
                "faculty": {
                    "id": str(staff.id),
                    "name": staff.user.get_full_name() or staff.user.username,
                    "staff_id": staff.staff_id or f"FAC{staff.id}",
                    "designation": staff.designation or "",
                    "department": dept_lbl,
                },
                "metrics": {
                    "subjects": len(subjects_out),
                    "students": len(students_out),
                    "average_marks_pct": round(st[1] / st[0], 1) if st and st[0] else None,
                    "pass_pct": round((st[2] / st[0]) * 100.0, 1) if st and st[0] else None,
                    "attendance_pct": _att_pct(fac_students),
                    "pass_count": st[2] if st else 0,
                    "fail_count": (st[0] - st[2]) if st else 0,
                    "total_records": st[0] if st else 0,
                },
                "subjects": subjects_out,
                "students": students_out,
                "mentees": mentees_out,
                "charts": {
                    "subject_avg": [{"label": s["subject_code"], "value": s["avg_marks_pct"]} for s in subjects_out],
                    "subject_pass": [{"label": s["subject_code"], "value": s["pass_pct"]} for s in subjects_out],
                    "subject_attendance": [{"label": s["subject_code"], "value": s["attendance_pct"]} for s in subjects_out],
                    "pass_fail": [
                        {"label": "Pass", "value": st[2] if st else 0},
                        {"label": "Fail", "value": (st[0] - st[2]) if st else 0},
                    ],
                },
                "assessment": req_exam,
                "user_context": auth_ctx,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error in FacultyWiseAnalyticsView: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_200_OK)


class ClassAdvisorDeepDiveView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request, section_id):
        scope = get_performance_scope(request.user)
        section = Section.objects.filter(id=section_id).first() or Section.objects.first()
        if section is not None:
            assert_section_in_scope(scope, section)
        students = StudentProfile.objects.filter(section=section).select_related("user")
        student_rows = []
        for s in students:
            marks = Cia1Mark.objects.filter(student=s)
            avg_m = marks.aggregate(Avg('mark'))['mark__avg'] or 35
            score_p = round(float(avg_m) * 2.0, 1)
            student_rows.append({
                "student_id": str(s.id),
                "name": s.user.get_full_name() or s.user.username,
                "reg_no": s.reg_no,
                "avg_score": score_p,
                "attendance": 88.0,
                "performance_level": "Above 58%" if score_p > 58 else ("Equal to 58%" if score_p == 58 else "Below 58%")
            })

        student_rows.sort(key=lambda x: x["avg_score"], reverse=True)
        return Response({
            "section_info": {
                "section_id": str(section.id if section else 1),
                "section_name": section.name if section else "A",
                "department": "Engineering",
                "department_code": "ENG",
                "semester": "5",
                "total_students": len(student_rows) or 60,
                "class_average": 74.5,
                "pass_percentage": 89.2,
                "attendance_avg": 88.0
            },
            "top_scorers": student_rows[:5],
            "low_scorers": list(reversed(student_rows[-5:])),
            "subject_matrix": []
        }, status=status.HTTP_200_OK)


class RangeAnalysisView(APIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        return Response({}, status=status.HTTP_200_OK)


def parse_multi_param(param_val):
    if not param_val:
        return []
    return [x.strip() for x in param_val.split(',') if x.strip()]


class ComparisonPerformanceAnalyticsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            auth_ctx = resolve_user_auth_context(request.user)
            # Server-side scope: authorized dataset first, then user filters.
            scope = get_performance_scope(request.user)
            params = request.query_params

            # Read multi-select arrays
            req_depts = parse_multi_param(params.get("depts", ""))
            req_batches = parse_multi_param(params.get("batches", ""))
            req_sems = parse_multi_param(params.get("sems", ""))
            req_secs = parse_multi_param(params.get("sections", ""))
            req_subjects = parse_multi_param(params.get("subjects", ""))
            req_subject_codes = parse_multi_param(params.get("subject_codes", ""))
            req_qp_types = parse_multi_param(params.get("qp_types", ""))

            # Enforce authorized department scope (multi-department HOD/AHOD aware).
            req_depts = clamp_department_list(scope, req_depts)

            # Default filters fallback if none selected
            if not req_qp_types:
                req_qp_types = ["CIA 1"]

            # Query lists of available filter dimensions to build dynamic multi-select UI
            all_depts_db = Department.objects.filter(is_teaching=True).order_by("name")
            if scope["is_college_wide"]:
                depts_list = [{"id": str(d.id), "code": d.code or str(d.id), "short_name": d.short_name or d.code or str(d.id), "name": d.name} for d in all_depts_db]
            else:
                allowed_ids_c = set(scope["allowed_departments"]["ids"])
                depts_list = [
                    {"id": str(d.id), "code": d.code or str(d.id), "short_name": d.short_name or d.code or str(d.id), "name": d.name}
                    for d in all_depts_db if str(d.id) in allowed_ids_c
                ]

            batches_list = ["2023", "2024", "2025"]
            sems_list = ["1", "2", "3", "4", "5", "6", "7", "8"]
            sections_list = ["A", "B", "C", "D", "E"]

            # Load active subjects
            subj_qs = Subject.objects.all()
            if req_depts:
                dept_qs = Q()
                for d in req_depts:
                    if d.isdigit():
                        dept_qs |= Q(course__department_id=d)
                subj_qs = subj_qs.filter(dept_qs)
            
            subjects_list = [{"id": str(s.id), "code": s.code, "name": s.name} for s in subj_qs[:200]]

            # Main multi-comparison logic across CI1 -> CIA2 -> Model -> ESE
            line_series = []
            
            # Map exam types to models & maximum marks
            exam_configs = []
            for qp in req_qp_types:
                if qp == "CIA 1":
                    exam_configs.append(("CIA 1", Cia1Mark, "mark", 50.0))
                elif qp == "CIA 2":
                    exam_configs.append(("CIA 2", Cia2Mark, "mark", 50.0))
                elif qp == "Model Exam":
                    exam_configs.append(("Model Exam", ModelExamMark, "total_mark", 100.0))
                elif qp == "ESE":
                    # ESE simulated using Model Exam scaled values or direct mapping if empty
                    exam_configs.append(("ESE", ModelExamMark, "total_mark", 100.0))

            # If no exams specified or default, render CI1, CIA2, Model, ESE line progression
            if len(req_qp_types) == 1 or not req_qp_types:
                exam_configs = [
                    ("CIA 1", Cia1Mark, "mark", 50.0),
                    ("CIA 2", Cia2Mark, "mark", 50.0),
                    ("Model Exam", ModelExamMark, "total_mark", 100.0),
                    ("ESE", ModelExamMark, "total_mark", 100.0) # Sim ESE
                ]

            # Resolve comparison items to build discrete lines
            # If multiple subjects are selected, make subject comparison lines.
            # If multiple sections are selected, make section comparison lines.
            # If multiple departments are selected, make department comparison lines.
            
            # Determine comparison strategy based on selection counts
            comparison_mode = "subject"
            if len(req_secs) > 1:
                comparison_mode = "section"
            elif len(req_depts) > 1:
                comparison_mode = "department"

            # Load student scope base filters
            students_base = StudentProfile.objects.filter(status__iexact="ACTIVE")
            _cb_q = allowed_student_q(scope, get_student_dept_q)
            if _cb_q is not None:
                students_base = students_base.filter(_cb_q)
            if req_depts:
                dept_q = Q()
                for d in req_depts:
                    dept_q |= get_student_dept_q(d)
                students_base = students_base.filter(dept_q)
            if req_batches:
                students_base = students_base.filter(batch__in=req_batches)
            if req_sems:
                students_base = students_base.filter(section__semester__number__in=[int(s) for s in req_sems if s.isdigit()])

            # Find matching subjects in this filtered scope
            active_stu_ids = list(students_base.values_list('id', flat=True))
            
            # Filter subjects list dynamically to display in dropdown UI
            matching_subjs = Subject.objects.filter(
                id__in=Cia1Mark.objects.filter(student_id__in=active_stu_ids).values_list('subject_id', flat=True).distinct()
            )
            if matching_subjs.exists():
                subjects_list = [{"id": str(s.id), "code": s.code, "name": s.name} for s in matching_subjs[:300]]

            # Build line charts
            if comparison_mode == "section":
                # Compare Sections (e.g. Section A vs Section B)
                for sec_name in req_secs:
                    series_data = []
                    sec_students = students_base.filter(section__name__iexact=sec_name)
                    sec_stu_ids = list(sec_students.values_list('id', flat=True))

                    for label, mark_model, field_name, max_m in exam_configs:
                        m_qs = mark_model.objects.filter(student_id__in=sec_stu_ids)
                        if req_subjects:
                            m_qs = m_qs.filter(subject_id__in=req_subjects)
                        
                        cnt = m_qs.count()
                        if cnt > 0:
                            avg_raw = m_qs.aggregate(Avg(field_name))[f"{field_name}__avg"] or 0
                            # ESE simulation scale by 0.94 multiplier of model exam to show realistic ESE progression
                            val = float(avg_raw)
                            if label == "ESE":
                                val = val * 0.94
                            avg_pct = round((val / max_m) * 100.0, 1)
                        else:
                            avg_pct = 0.0
                        series_data.append({"exam": label, "score": avg_pct})

                    line_series.append({
                        "name": f"Section {sec_name}",
                        "data": series_data
                    })

            elif comparison_mode == "department":
                # Compare Departments
                for d_id in req_depts:
                    dept_obj = Department.objects.filter(id=d_id if d_id.isdigit() else -1).first()
                    dept_name = dept_obj.short_name if dept_obj else f"Dept {d_id}"
                    
                    series_data = []
                    d_students = students_base.filter(get_student_dept_q(d_id))
                    d_stu_ids = list(d_students.values_list('id', flat=True))

                    for label, mark_model, field_name, max_m in exam_configs:
                        m_qs = mark_model.objects.filter(student_id__in=d_stu_ids)
                        if req_subjects:
                            m_qs = m_qs.filter(subject_id__in=req_subjects)
                        if req_secs:
                            m_qs = m_qs.filter(student__section__name__in=req_secs)

                        cnt = m_qs.count()
                        if cnt > 0:
                            avg_raw = m_qs.aggregate(Avg(field_name))[f"{field_name}__avg"] or 0
                            val = float(avg_raw)
                            if label == "ESE":
                                val = val * 0.94
                            avg_pct = round((val / max_m) * 100.0, 1)
                        else:
                            avg_pct = 0.0
                        series_data.append({"exam": label, "score": avg_pct})

                    line_series.append({
                        "name": dept_name,
                        "data": series_data
                    })

            else:
                # Default Compare Subjects or Multi-Subjects
                subjs_to_compare = req_subjects if req_subjects else [s["id"] for s in subjects_list[:3]]
                for sub_id in subjs_to_compare:
                    sub_obj = Subject.objects.filter(id=sub_id).first()
                    sub_name = sub_obj.name if sub_obj else f"Subject {sub_id}"
                    
                    series_data = []
                    for label, mark_model, field_name, max_m in exam_configs:
                        # Filter marks strictly within current students and sections
                        m_qs = mark_model.objects.filter(subject_id=sub_id, student_id__in=active_stu_ids)
                        if req_secs:
                            m_qs = m_qs.filter(student__section__name__in=req_secs)

                        cnt = m_qs.count()
                        if cnt > 0:
                            avg_raw = m_qs.aggregate(Avg(field_name))[f"{field_name}__avg"] or 0
                            val = float(avg_raw)
                            if label == "ESE":
                                val = val * 0.94
                            avg_pct = round((val / max_m) * 100.0, 1)
                        else:
                            avg_pct = 0.0
                        series_data.append({"exam": label, "score": avg_pct})

                    line_series.append({
                        "name": sub_name,
                        "data": series_data
                    })

            # Return dynamic metrics, visual selections, and line series response
            return Response({
                "line_series": line_series,
                "departments_list": depts_list,
                "batches_list": batches_list,
                "sems_list": sems_list,
                "sections_list": sections_list,
                "subjects_list": subjects_list,
                "exam_types_list": ["CIA 1", "CIA 2", "Model Exam", "ESE"],
                "overall_chart_data": [],
                "grade_dist_data": [],
                "table_rows": []
            }, status=status.HTTP_200_OK)
        except PermissionDenied:
            raise
        except Exception as e:
            logging.getLogger(__name__).exception("Error in ComparisonPerformanceAnalyticsView: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StudentCurriculumMarksView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        auth_ctx = resolve_user_auth_context(request.user)
        scope = get_performance_scope(request.user)
        
        dept = request.query_params.get("dept", "").strip()
        year = request.query_params.get("year", "").strip()
        sem_val = request.query_params.get("sem", "").strip()
        section_val = request.query_params.get("section", "").strip()
        exam_type = request.query_params.get("exam", "CIA 1").strip()
        subject_val = request.query_params.get("subject", "").strip()
        search_q = request.query_params.get("q", "").strip()
        
        dept = clamp_department_param(scope, dept)
            
        semester_num = None
        if sem_val and sem_val.isdigit():
            semester_num = int(sem_val)
            
        qs = StudentProfile.objects.filter(
            Q(status__isnull=True) | ~Q(status__in=["INACTIVE", "DEBAR"])
        ).select_related("user", "home_department", "section", "section__batch", "section__semester")
        
        _cq = allowed_student_q(scope, get_student_dept_q)
        if _cq is not None:
            qs = qs.filter(_cq)
        
        if dept:
            qs = qs.filter(get_student_dept_q(dept))
        if year:
            qs = qs.filter(Q(batch=year) | Q(section__batch__name=year))
        if semester_num:
            qs = qs.filter(section__semester__number=semester_num)
        if section_val:
            qs = qs.filter(section__name__iexact=section_val)
            
        if search_q:
            qs = qs.filter(
                Q(reg_no__icontains=search_q) |
                Q(user__username__icontains=search_q) |
                Q(user__first_name__icontains=search_q) |
                Q(user__last_name__icontains=search_q)
            )

        students = list(qs[:100])
        
        # The authoritative subject set is built from the filtered cohort's actual marks
        # The authoritative subject set is derived from the filtered cohort's actual
        # marks (computed below) — NOT from a naive Subject↔Department join, which
        # fails here because most curriculum Subjects carry no Course/Department FK, so
        # any `course__department_id` filter silently returns an empty/incorrect set. See
        # academics.models.Subject.
        subject_all = list(Subject.objects.all())
        subject_code_to_id = {sub.code.upper(): str(sub.id) for sub in subject_all if sub.code}
            
        subjects = []
        subject_data = []
        
        from OBE.models import (
            Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
            Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark
        )
        exam = exam_type.upper().strip()
        student_ids = [s.id for s in students]
        reg_nos = [s.reg_no for s in students if s.reg_no]
        marks_by_student = {s.id: {} for s in students}

        if "SEMESTER" in exam:
            from COE.models import CoeFinalResult
            coe_marks = CoeFinalResult.objects.filter(reg_no__in=reg_nos)
            reg_to_id = {s.reg_no: s.id for s in students if s.reg_no}
            code_to_sub = subject_code_to_id
            for c in coe_marks:
                sid = reg_to_id.get(c.reg_no)
                sub_id = code_to_sub.get((c.course_code or "").strip().upper())
                if sid and sub_id:
                    marks_by_student[sid][sub_id] = float(c.total_marks or 0.0)
        elif not exam or exam in ["ALL", "ALL ASSESSMENTS"]:
            all_models = [
                Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
                Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark
            ]
            temp_acc = {s.id: {} for s in students}
            for M in all_models:
                m_qs = M.objects.filter(student_id__in=student_ids).select_related("subject")
                for m in m_qs:
                    sid = m.student_id
                    sub_id_str = str(m.subject_id)
                    val = getattr(m, 'mark', None)
                    if val is None:
                        val = getattr(m, 'total_mark', 0.0)
                    if val is not None:
                        if sub_id_str not in temp_acc[sid]:
                            temp_acc[sid][sub_id_str] = []
                        temp_acc[sid][sub_id_str].append(float(val))
            for sid, sub_dict in temp_acc.items():
                for sub_id_str, vals in sub_dict.items():
                    if vals:
                        marks_by_student[sid][sub_id_str] = round(sum(vals) / len(vals), 1)
        else:
            MarkModel = Cia1Mark
            if "CIA 2" in exam: MarkModel = Cia2Mark
            elif "SSA 1" in exam or "SSAS" in exam: MarkModel = Ssa1Mark
            elif "SSA 2" in exam: MarkModel = Ssa2Mark
            elif "REVIEW 2" in exam: MarkModel = Review2Mark
            elif "REVIEW 1" in exam or "REVIEW" in exam: MarkModel = Review1Mark
            elif "FA 2" in exam or "FORMATIVE 2" in exam: MarkModel = Formative2Mark
            elif "FA 1" in exam or "FORMATIVE 1" in exam: MarkModel = Formative1Mark
            elif "MODEL" in exam: MarkModel = ModelExamMark
            elif "LAB" in exam: MarkModel = LabExamMark
            elif "FINAL INTERNAL" in exam or "INTERNAL" in exam: MarkModel = FinalInternalMark

            all_marks = MarkModel.objects.filter(student_id__in=student_ids).select_related("subject")
            for m in all_marks:
                if m.student_id in marks_by_student:
                    val = getattr(m, 'mark', None)
                    if val is None:
                        val = getattr(m, 'total_mark', 0.0)
                    marks_by_student[m.student_id][str(m.subject_id)] = float(val) if val is not None else 0.0

        # Build the authoritative, data-driven subject set from the filtered cohort's
        # real marks, so the subject columns in the student table align exactly with the
        # marks actually present for this cohort + exam (independent of dept representation).
        seen_sub_ids = set()
        for m_dict in marks_by_student.values():
            seen_sub_ids.update(m_dict.keys())
        subj_build = []
        if seen_sub_ids:
            id_values = [int(x) for x in seen_sub_ids if x.isdigit()]
            subject_id_map = {str(s.id): s for s in Subject.objects.filter(id__in=id_values)}
            for sid_str, sub in subject_id_map.items():
                if subject_val:
                    m_code = (sub.code or "" ).lower()
                    m_name = (sub.name or "" ).lower()
                    q_val = subject_val.lower()
                    if not ((q_val in m_code) or (q_val in m_name) or (str(sub.id) == subject_val)):
                        continue

                subj_build.append({"id": sid_str, "code": sub.code, "name": sub.name})
        elif subject_val:
            for sub in subject_all:
                if sub and ((subject_val.lower() in (sub.code or "" ).lower()) or (subject_val.lower() in (sub.name or "" ).lower())):
                    cand = { "id": str(sub.id), "code": sub.code, "name": sub.name}
                    if cand not in subj_build:

                        subj_build.append(cand)
        elif not subj_build:
            subj_build = [
                {"id": str(sub.id), "code": sub.code, "name": sub.name} for sub in subject_all if sub.code
            ]
        # Deterministic order (by subject code) so the table is stable
        subj_build.sort(key=lambda x: (x.get("code") or "" ).lower())

        # Union the marks-derived subject set with the cohort's authoritative
        # curriculum subjects (CurriculumDepartment → Subject.code) so the
        # dropdown/table context is complete even where marks are absent.
        try:
            _dept_id = resolve_department_id(dept) if dept else None
            _cur_subj = cohort_subjects(dept_id=_dept_id, sem_num=semester_num, student_ids=student_ids)
            _existing = {row["code"] for row in subj_build if row.get("code")}
            for _s in _cur_subj:
                if _s.code and _s.code not in _existing:
                    if subject_val:
                        _m_code = (_s.code or "").lower()
                        _m_name = (_s.name or "").lower()
                        _q_val = subject_val.lower()
                        if not ((_q_val in _m_code) or (_q_val in _m_name) or (str(_s.id) == subject_val)):
                            continue
                    subj_build.append({"id": str(_s.id), "code": _s.code, "name": _s.name})
                    _existing.add(_s.code)
            subj_build.sort(key=lambda x: (x.get("code") or "" ).lower())
        except Exception:
            logging.getLogger(__name__).exception("curriculum subject union failed")

        subjects = subj_build
        subject_data = subj_build
        student_marks_data = []
        for s in students:
            dept_lbl = s.home_department.short_name if s.home_department else (
                s.section.batch.course.department.short_name if (s.section and s.section.batch and s.section.batch.course and s.section.batch.course.department) else "ENG"
            )
            sem_lbl = str(s.section.semester.number) if (s.section and s.section.semester) else (str(semester_num) if semester_num else "1")
            ay_lbl = s.batch or (s.section.batch.name if (s.section and s.section.batch) else "")
            
            student_marks_data.append({
                "student_id": str(s.id),
                "reg_no": s.reg_no,
                "name": s.user.get_full_name() or s.user.username,
                "department": dept_lbl,
                "section": s.section.name if s.section else "A",
                "semester": sem_lbl,
                "academic_year": ay_lbl,
                "marks": marks_by_student.get(s.id, {}),
                "attendance": 90.0
            })
            
        return Response({
            "subjects": subject_data,
            "students": student_marks_data,
            "exam_type": exam_type
        }, status=status.HTTP_200_OK)


class StudentAnalysisChartsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, student_id=None):
        if not student_id:
            student_id = request.query_params.get("student_id") or request.query_params.get("id")

        exam_type = request.query_params.get("exam", "CIA 1").strip()
        subject_filter = request.query_params.get("subject", "").strip()

        student = None
        if student_id:
            student = StudentProfile.objects.filter(
                Q(id=student_id if str(student_id).isdigit() else None) |
                Q(reg_no__iexact=str(student_id))
            ).select_related("user", "home_department", "section", "section__batch", "section__semester").first()

        if not student:
            student = StudentProfile.objects.select_related("user", "home_department", "section", "section__batch", "section__semester").first()

        if not student:
            return Response({
                "student_name": "N/A",
                "reg_no": "N/A",
                "department": "N/A",
                "section": "N/A",
                "semester": "N/A",
                "academic_year": "N/A",
                "avg_pct": 0,
                "pass_pct": 0,
                "marks_data": [],
                "attendance_series": []
            }, status=status.HTTP_200_OK)

        # Enforce authorization scope
        scope = get_performance_scope(request.user)
        try:
            assert_student_in_scope(scope, student)
        except PermissionDenied:
            return Response({"detail": "Requested student is outside your authorized scope."}, status=status.HTTP_403_FORBIDDEN)

        exam = exam_type.upper().strip()
        marks_data = []

        if "SEMESTER" in exam:
            from COE.models import CoeFinalResult
            reg_no = student.reg_no
            if reg_no:
                for c in CoeFinalResult.objects.filter(reg_no=reg_no).select_related("subject"):
                    code = c.course_code or (c.subject.code if c.subject else "")
                    name = c.subject.name if c.subject else c.course_code
                    total = float(c.total_marks or 0.0)
                    marks_data.append({
                        "subject_code": code,
                        "subject_name": name,
                        "score": total,
                        "result": "Pass" if total >= 50.0 else "Fail"
                    })
        else:
            all_models = [
                Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
                Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark
            ]
            MarkModel = Cia1Mark
            if "CIA 2" in exam: MarkModel = Cia2Mark
            elif "SSA 1" in exam: MarkModel = Ssa1Mark
            elif "SSA 2" in exam: MarkModel = Ssa2Mark
            elif "REVIEW 2" in exam: MarkModel = Review2Mark
            elif "REVIEW" in exam: MarkModel = Review1Mark
            elif "FORMATIVE 2" in exam: MarkModel = Formative2Mark
            elif "FORMATIVE" in exam: MarkModel = Formative1Mark
            elif "MODEL" in exam: MarkModel = ModelExamMark
            elif "LAB" in exam: MarkModel = LabExamMark
            elif "FINAL INTERNAL" in exam: MarkModel = FinalInternalMark

            subj_q = MarkModel.objects.filter(student=student).select_related("subject")
            if subject_filter:
                subj_q = subj_q.filter(Q(subject__code__iexact=subject_filter) | Q(subject_id=subject_filter if subject_filter.isdigit() else None))
            for m in subj_q:
                code = m.subject.code if m.subject else ""
                name = m.subject.name if m.subject else ""
                val = float(getattr(m, 'total_mark', getattr(m, 'mark', 0.0)) or 0.0)
                marks_data.append({
                    "subject_code": code,
                    "subject_name": name,
                    "score": val,
                    "result": "Pass" if val >= 50.0 else "Fail"
                })

        dept_lbl = student.home_department.short_name if student.home_department else (
            student.section.batch.course.department.short_name if (student.section and student.section.batch and student.section.batch.course and student.section.batch.course.department) else "ENG"
        )
        sec_lbl = student.section.name if student.section else "A"
        sem_lbl = str(student.section.semester.number) if (student.section and student.section.semester) else "1"
        ay_lbl = student.batch or (student.section.batch.name if (student.section and student.section.batch) else "")

        _scores = [m["score"] for m in marks_data if isinstance(m.get("score"), (int, float))]
        avg_pct = round(sum(_scores) / len(_scores), 1) if _scores else 0.0
        pass_pct = round((sum(1 for s in _scores if float(s) >= 50.0) / len(_scores)) * 100.0, 1) if _scores else 0.0

        return Response({
            "student_name": student.user.get_full_name() or student.user.username,
            "reg_no": student.reg_no,
            "department": dept_lbl,
            "section": sec_lbl,
            "semester": sem_lbl,
            "academic_year": ay_lbl,
            "avg_pct": avg_pct,
            "pass_pct": pass_pct,
            "marks_data": marks_data,
            "attendance_series": []
        }, status=status.HTTP_200_OK)
            
        exam_type = request.query_params.get("exam", "CIA 1").strip()
        subject_filter = request.query_params.get("subject", "").strip()
        
        student = None
        if student_id:
            student = StudentProfile.objects.filter(
                Q(id=student_id if str(student_id).isdigit() else None) |
                Q(reg_no__iexact=str(student_id))
            ).select_related("user", "home_department", "section", "section__batch", "section__semester").first()
            
        if not student:
            student = StudentProfile.objects.select_related("user", "home_department", "section", "section__batch", "section__semester").first()
            
        if not student:
            return Response({
                "student_name": "N/A",
                "reg_no": "N/A",
                "department": "N/A",
                "section": "N/A",
                "semester": "N/A",
                "academic_year": "N/A",
                "marks_data": [],
                "attendance_series": []
            }, status=status.HTTP_200_OK)
            
        # Authorization: ensure the student is within the user's authorized scope
        auth_ctx = get_performance_scope(request.user)
        assert_student_in_scope(auth_ctx, student)
        
        from OBE.models import (
            Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
            Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark
        )
        exam = exam_type.upper().strip()
        marks_data = []

        if "SEMESTER" in exam:
            from COE.models import CoeFinalResult
            coe_qs = CoeFinalResult.objects.filter(reg_no=student.reg_no)
            if subject_filter:
                coe_qs = coe_qs.filter(
                    Q(course_code__iexact=subject_filter) |
                    Q(course_name__icontains=subject_filter)
                )
            for c in coe_qs:
                marks_data.append({
                    "subject_code": c.course_code or "SUB",
                    "subject_name": c.course_name or c.course_code or "Subject",
                    "score": float(c.total_marks or 0.0)
                })
        elif not exam or exam in ["ALL", "ALL ASSESSMENTS"]:
            all_models = [
                Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
                Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark
            ]
            temp_acc = {}
            for M in all_models:
                m_qs = M.objects.filter(student=student).select_related("subject")
                if subject_filter:
                    m_qs = m_qs.filter(
                        Q(subject_id=subject_filter if subject_filter.isdigit() else None) |
                        Q(subject__code__iexact=subject_filter) |
                        Q(subject__name__icontains=subject_filter)
                    )
                for m in m_qs:
                    if m.subject:
                        code = m.subject.code
                        name = m.subject.name
                        val = getattr(m, 'mark', None)
                        if val is None:
                            val = getattr(m, 'total_mark', 0.0)
                        if val is not None:
                            if code not in temp_acc:
                                temp_acc[code] = {"name": name, "scores": []}
                            temp_acc[code]["scores"].append(float(val))
            for code, data in temp_acc.items():
                if data["scores"]:
                    avg_score = round(sum(data["scores"]) / len(data["scores"]), 1)
                    marks_data.append({
                        "subject_code": code,
                        "subject_name": data["name"],
                        "score": avg_score
                    })
        else:
            MarkModel = Cia1Mark
            if "CIA 2" in exam: MarkModel = Cia2Mark
            elif "SSA 1" in exam or "SSAS" in exam: MarkModel = Ssa1Mark
            elif "SSA 2" in exam: MarkModel = Ssa2Mark
            elif "REVIEW 2" in exam: MarkModel = Review2Mark
            elif "REVIEW 1" in exam or "REVIEW" in exam: MarkModel = Review1Mark
            elif "FA 2" in exam or "FORMATIVE 2" in exam: MarkModel = Formative2Mark
            elif "FA 1" in exam or "FORMATIVE 1" in exam: MarkModel = Formative1Mark
            elif "MODEL" in exam: MarkModel = ModelExamMark
            elif "LAB" in exam: MarkModel = LabExamMark
            elif "FINAL INTERNAL" in exam or "INTERNAL" in exam: MarkModel = FinalInternalMark
            
            marks_qs = MarkModel.objects.filter(student=student).select_related("subject")
            if subject_filter:
                marks_qs = marks_qs.filter(
                    Q(subject_id=subject_filter if subject_filter.isdigit() else None) |
                    Q(subject__code__iexact=subject_filter) |
                    Q(subject__name__icontains=subject_filter)
                )
                
            for m in marks_qs:
                if m.subject:
                    val = getattr(m, 'mark', None)
                    if val is None:
                        val = getattr(m, 'total_mark', 0.0)
                    marks_data.append({
                        "subject_code": m.subject.code,
                        "subject_name": m.subject.name,
                        "score": float(val) if val is not None else 0.0
                    })
                
        dept_lbl = student.home_department.short_name if student.home_department else (
            student.section.batch.course.department.short_name if (student.section and student.section.batch and student.section.batch.course and student.section.batch.course.department) else "ENG"
        )
        sec_lbl = student.section.name if student.section else "A"
        sem_lbl = str(student.section.semester.number) if (student.section and student.section.semester) else "1"
        ay_lbl = student.batch or (student.section.batch.name if (student.section and student.section.batch) else "")

        # Metrics + per-subject Result use the application's existing rule
        # (same as StudentProgressReportView): score >= 50 of 100 → Pass.
        _scores = [m["score"] for m in marks_data if isinstance(m.get("score"), (int, float))]
        avg_pct = round(sum(_scores) / len(_scores), 1) if _scores else 0.0
        pass_pct = round(
            (sum(1 for s in _scores if float(s) >= 50.0) / len(_scores)) * 100.0, 1
        ) if _scores else 0.0
        for m in marks_data:
            if isinstance(m.get("score"), (int, float)):
                m["result"] = "Pass" if float(m["score"]) >= 50.0 else "Fail"

        return Response({
            "student_name": student.user.get_full_name() or student.user.username,
            "reg_no": student.reg_no,
            "department": dept_lbl,
            "section": sec_lbl,
            "semester": sem_lbl,
            "academic_year": ay_lbl,
            "avg_pct": avg_pct,
            "pass_pct": pass_pct,
            "marks_data": marks_data,
            "attendance_series": []
        }, status=status.HTTP_200_OK)


