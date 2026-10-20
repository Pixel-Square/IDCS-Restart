from django.db.models import Max, Q

# NOTE: DEFAULT_TOTALS removed. All total marks are now derived dynamically using get_max_ref.

def get_remark(pct):
    if pct >= 90: return "Excellent"
    if pct >= 80: return "Very Good"
    if pct >= 70: return "Good"
    if pct >= 60: return "Satisfactory"
    if pct >= 50: return "Needs Improvement"
    return "Needs Significant Improvement"


def _get_pass_threshold():
    """Return the configured pass threshold (0-100 scale) from AcV2PassMarkSetting.
    Defaults to 50.0 if no record exists."""
    try:
        from academic_v2.models import AcV2PassMarkSetting
        pms, _ = AcV2PassMarkSetting.objects.get_or_create(
            label='Default', defaults={'out_of': 100, 'pass_mark': 50}
        )
        if pms.out_of and pms.out_of > 0:
            return round(pms.pass_mark / pms.out_of * 100.0, 4)
    except Exception:
        pass
    return 50.0


def get_obe_max_ref(model, field):
    """Observed maximum for a legacy OBE mark field.

    Used to normalize legacy marks as percentages without any hardcoded scale
    (the old CIA /50 assumptions are gone): the reference is the highest mark
    actually stored for that model/field, falling back to 100.0 when empty.
    """
    try:
        ref = model.objects.aggregate(m=Max(field))["m"]
        val = float(ref) if ref is not None else 0.0
    except Exception:
        val = 0.0
    return val if val > 0 else 100.0


# Canonical exam-name normaliser — maps the free-form display names used across
# the database into a short uppercase key used for filtering.
_EXAM_KEY_MAP = {
    # CIA
    'CIA_1': 'CIA 1', 'CIA 1': 'CIA 1', 'CIA1': 'CIA 1',
    'CIA_2': 'CIA 2', 'CIA 2': 'CIA 2', 'CIA2': 'CIA 2',
    # SSA
    'SSA_1': 'SSA 1', 'SSA 1': 'SSA 1', 'SSA1': 'SSA 1',
    'SSA_2': 'SSA 2', 'SSA 2': 'SSA 2', 'SSA2': 'SSA 2',
    # REVIEW
    'REVIEW_1': 'REVIEW 1', 'REVIEW 1': 'REVIEW 1', 'REVIEW1': 'REVIEW 1',
    'REVIEW_2': 'REVIEW 2', 'REVIEW 2': 'REVIEW 2', 'REVIEW2': 'REVIEW 2',
    # FORMATIVE
    'FORMATIVE_1': 'FORMATIVE 1', 'FORMATIVE 1': 'FORMATIVE 1', 'FA1': 'FORMATIVE 1',
    'FORMATIVE_2': 'FORMATIVE 2', 'FORMATIVE 2': 'FORMATIVE 2', 'FA2': 'FORMATIVE 2',
    # MODEL / LAB
    'MODEL': 'MODEL', 'MODEL EXAM': 'MODEL',
    'LAB': 'LAB', 'LAB EXAM': 'LAB',
    # CQI
    'CQI_1': 'CQI 1', 'CQI1': 'CQI 1', 'CQI 1': 'CQI 1',
    'CQI_2': 'CQI 2', 'CQI2': 'CQI 2', 'CQI 2': 'CQI 2',
    'CQI_3': 'CQI 3', 'CQI3': 'CQI 3', 'CQI 3': 'CQI 3',
    # FINAL INTERNAL
    'FINAL INTERNAL': 'FINAL INTERNAL', 'FINAL_INTERNAL': 'FINAL INTERNAL',
    # ESE / End Semester Examination — every alias collapses to one canonical key
    'ESE': 'SEMESTER EXAM', 'SEM': 'SEMESTER EXAM',
    'SEMESTER': 'SEMESTER EXAM', 'SEMESTER EXAM': 'SEMESTER EXAM',
    'SEMESTER EXAMINATION': 'SEMESTER EXAM',
    'END SEMESTER': 'SEMESTER EXAM', 'END SEMESTER EXAM': 'SEMESTER EXAM',
    'END SEMESTER EXAMINATION': 'SEMESTER EXAM',
}


def _canonical_exam_key(u):
    """Canonicalise an already-uppercased exam name.

    Tolerates the underscore/space variants found across the database
    (CIA_1 vs CIA 1, END_SEMESTER_EXAMINATION vs End Semester Examination)
    by falling back to an underscore→space normalisation before giving up.
    """
    if not u:
        return ''
    if u in _EXAM_KEY_MAP:
        return _EXAM_KEY_MAP[u]
    spaced = u.replace('_', ' ')
    if spaced in _EXAM_KEY_MAP:
        return _EXAM_KEY_MAP[spaced]
    return spaced

def _normalise_exam_key(exam_str):
    """Return a canonical uppercased exam key, or empty string for ALL/unknown."""
    if not exam_str:
        return ''
    u = exam_str.strip().upper()
    if u in ('ALL', 'ALL ASSESSMENTS'):
        return ''
    return _canonical_exam_key(u)


def _exam_key_matches(ea_exam, ea_display, target_key):
    """Return True if an AcV2ExamAssignment's exam identifiers match target_key.
    Uses both the raw `exam` field and `exam_display_name` for fuzzy matching.
    target_key should already be normalised via _normalise_exam_key().
    Empty target_key means ALL — always returns True."""
    if not target_key:
        return True
    for raw in ((ea_exam or '').strip().upper(), (ea_display or '').strip().upper()):
        if not raw:
            continue
        if target_key in (raw, _canonical_exam_key(raw)):
            return True
    return False


def _fetch_acv2_marks(student, subject_filter='', exam_type_filter=''):
    """
    Return marks data rows from published AcV2StudentMark records for a student.
    Format matches the OBE marks_data rows so callers can merge them transparently.

    Rules:
    - Only PUBLISHED exam assignments are included (draft/locked are excluded).
    - Empty assignments (total_mark IS NULL) and absent records are excluded.
    - subject_filter: optional substring match against subject_code / subject_name.
    - exam_type_filter: optional exam type (e.g. "CIA 1") — empty = ALL assessments.
      Filters by matching the AcV2ExamAssignment.exam / exam_display_name.
    - Subject identity is resolved from AcV2Section.course.subject_code/subject_name
      (the reliable denormalized path) with TA chain as fallback.
    """
    try:
        from academic_v2.models import AcV2StudentMark
        rows = []
        target_key = _normalise_exam_key(exam_type_filter)

        pass_threshold = _get_pass_threshold()
        seen_keys = set()
        qs = AcV2StudentMark.objects.filter(
            student=student,
            total_mark__isnull=False,
            is_absent=False,
            is_exempted=False,
            exam_assignment__status='PUBLISHED',
        ).select_related(
            'exam_assignment',
            'exam_assignment__section',
            'exam_assignment__section__course',           # AcV2Course
            'exam_assignment__section__course__semester', # academics.Semester
            'exam_assignment__section__faculty_user',
            'exam_assignment__section__teaching_assignment',
            'exam_assignment__section__teaching_assignment__staff',
            'exam_assignment__section__teaching_assignment__staff__user',
            'exam_assignment__section__teaching_assignment__staff__department',
            'exam_assignment__section__teaching_assignment__section',
            'exam_assignment__section__teaching_assignment__section__managing_department',
            'exam_assignment__section__teaching_assignment__section__batch__course__department',
            'exam_assignment__section__teaching_assignment__curriculum_row',
            'exam_assignment__section__teaching_assignment__elective_subject',
            'exam_assignment__section__teaching_assignment__subject',
        )

        for sm in qs:
            ea = sm.exam_assignment

            # Exam-type filter — skip if not matching the requested exam
            if target_key and not _exam_key_matches(ea.exam, ea.exam_display_name, target_key):
                continue

            # Use the assignment's actual maximum marks for normalisation.
            # No hardcoded CIA/50 assumption: fall back to 100.0 only when the
            # stored max is missing or non-positive.
            try:
                mx = float(ea.max_marks) if ea.max_marks is not None else 0.0
            except (TypeError, ValueError):
                mx = 0.0
            if mx <= 0:
                mx = 100.0
            score = float(sm.total_mark)
            pct = min(100.0, (score / mx) * 100.0) if mx > 0 else 0.0
            is_pass = pct >= pass_threshold

            # ── Subject identity ──────────────────────────────────────────────
            # Primary: AcV2Section.course (always populated, denormalized)
            sec = ea.section
            course = sec.course if sec else None
            sem_num = None
            if course:
                if course.semester:
                    sem_num = course.semester.number
                if course.subject_code or course.subject_name:
                    subj_code = course.subject_code or ''
                    subj_name = course.subject_name or ''
                else:
                    subj_code, subj_name = '', ''
            else:
                subj_code, subj_name = '', ''

            # Fallback: TeachingAssignment chain if subject_code still blank
            ta = sec.teaching_assignment if sec else None
            if not subj_code:
                if ta:
                    if getattr(ta, 'curriculum_row_id', None):
                        cr = ta.curriculum_row
                        subj_code = getattr(cr, 'course_code', '') or ''
                        subj_name = getattr(cr, 'course_name', '') or ''
                    elif getattr(ta, 'elective_subject_id', None):
                        es = ta.elective_subject
                        subj_code = getattr(es, 'course_code', '') or ''
                        subj_name = getattr(es, 'course_name', '') or ''
                    elif getattr(ta, 'subject_id', None):
                        subj_code = ta.subject.code or ''
                        subj_name = ta.subject.name or ''

            # Section label & Semester fallback
            sec_name = sec.section_name if sec else ''
            if sem_num is None and ta and getattr(ta, 'section', None) and ta.section.semester:
                sem_num = ta.section.semester.number

            # Faculty resolution (TA staff -> Section faculty_user)
            faculty_name = ''
            if ta and getattr(ta, 'staff', None) and ta.staff.user:
                faculty_name = ta.staff.user.get_full_name() or ta.staff.user.username
            elif sec and getattr(sec, 'faculty_user', None):
                faculty_name = sec.faculty_user.get_full_name() or sec.faculty_user.username

            # Department resolution
            dept_code = ''
            dept_name = ''
            dept_obj = None
            if ta:
                acad_sec = getattr(ta, 'section', None)
                if acad_sec:
                    dept_obj = getattr(acad_sec, 'managing_department', None)
                    if not dept_obj and acad_sec.batch and acad_sec.batch.course:
                        dept_obj = getattr(acad_sec.batch.course, 'department', None)
                if not dept_obj and getattr(ta, 'staff', None):
                    dept_obj = getattr(ta.staff, 'department', None)
            if dept_obj:
                dept_code = dept_obj.short_name or dept_obj.code or ''
                dept_name = dept_obj.name or ''

            # Subject filter
            if subject_filter:
                haystack = (subj_code + ' ' + subj_name).lower()
                if subject_filter.lower() not in haystack:
                    continue

            # Prevent duplicate counting for duplicate-looking exam names
            # (e.g. 'CIA 1' vs 'CIA_1' stored as separate assignments):
            # keep only the first published record per
            # (subject, canonical exam) for this student.
            dedup_key = (
                (subj_code or '').upper(),
                target_key or _canonical_exam_key((ea.exam or '').strip().upper()),
            )
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            rows.append({
                'subject_code': subj_code or ea.exam,
                'subject_name': subj_name or subj_code or ea.exam,
                'assessment': ea.exam_display_name or ea.exam,
                'score': score,
                'max_mark': mx,
                'score_pct': round(pct, 1),
                'remark': get_remark(pct),
                'is_pass': is_pass,
                'pass_threshold': pass_threshold,
                'semester': sem_num,
                'section': sec_name,
                'faculty': faculty_name,
                'dept_code': dept_code,
                'dept_name': dept_name,
                # Extra metadata for callers that need it
                '_source': 'acv2',
                '_ea_id': str(ea.id),
            })
        return rows
    except Exception:
        return []


def get_student_marks_data(student, exam_type, subject_filter=''):
    """
    Build the per-subject marks list for a single student.

    Source-of-truth strategy:
    - OBE mark models are the legacy source for internal assessments.
    - AcV2StudentMark (published only) is merged IN ADDITION where it covers
      a *different subject/assessment combination* not already present in OBE.
    - To prevent double-counting the same student+subject+assessment, AcV2 rows
      whose (subject_code, assessment) key already exists in OBE results are
      skipped. (In practice the two systems record different subjects — the OBE
      system is being retired in favour of AcV2.)
    - For SEMESTER exam: only CoeFinalResult is used (ESE data source).
    """
    exam = exam_type.upper().strip()
    marks_data = []
    assessment_label = exam_type.strip() or "CIA 1"

    def _matches_subject(qs):
        if subject_filter:
            return qs.filter(
                Q(subject__code__iexact=subject_filter)
                | Q(subject__name__icontains=subject_filter)
            )
        return qs

    if "SEMESTER" in exam:
        from COE.models import CoeFinalResult
        coe_qs = CoeFinalResult.objects.filter(reg_no=student.reg_no)
        if subject_filter:
            coe_qs = coe_qs.filter(
                Q(course_code__iexact=subject_filter)
                | Q(course_name__icontains=subject_filter)
            )
        for c in coe_qs:
            total = float(c.total_marks or 0.0)
            max_mark = float(c.max_marks or 100.0)
            pct = (total / max_mark) * 100.0 if max_mark > 0 else 0.0
            marks_data.append({
                "subject_code": c.course_code or '',
                "subject_name": c.course_name or c.course_code or '',
                "assessment": "Semester Exam",
                "score": total,
                "max_mark": max_mark,
                "score_pct": round(pct, 1),
                "remark": get_remark(pct),
                "_source": "coe",
            })
        return marks_data

    from OBE.models import (
        Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
        Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
    )
    all_models = [
        ("CIA 1", Cia1Mark, "mark"), ("CIA 2", Cia2Mark, "mark"),
        ("SSA 1", Ssa1Mark, "mark"), ("SSA 2", Ssa2Mark, "mark"),
        ("REVIEW 1", Review1Mark, "mark"), ("REVIEW 2", Review2Mark, "mark"),
        ("FORMATIVE 1", Formative1Mark, "total"), ("FORMATIVE 2", Formative2Mark, "total"),
        ("MODEL", ModelExamMark, "total_mark"), ("LAB", LabExamMark, "total_mark"),
        ("FINAL INTERNAL", FinalInternalMark, "final_mark"),
    ]

    max_refs = {}
    def get_max_ref(model, field):
        if model not in max_refs:
            ref = model.objects.aggregate(m=Max(field))["m"]
            max_refs[model] = float(ref) if ref and float(ref) > 0 else 100.0
        return max_refs[model]

    def _get_record_max(model, m, field):
        if hasattr(m, 'max_mark') and getattr(m, 'max_mark') is not None:
            return float(m.max_mark)
        if hasattr(m, 'max_marks') and getattr(m, 'max_marks') is not None:
            return float(m.max_marks)
        return get_max_ref(model, field)

    def _score_of(m, field):
        val = getattr(m, field, None)
        if val is None and field != "total_mark":
            val = getattr(m, "total_mark", None)
        try:
            return float(val) if val is not None else None
        except (TypeError, ValueError):
            return None

    # ── Collect OBE marks ────────────────────────────────────────────────────
    obe_seen = set()  # (subject_code, assessment) — used to deduplicate AcV2

    if exam in ("ALL", "ALL ASSESSMENTS"):
        for label, model, field in all_models:
            for m in _matches_subject(model.objects.filter(student=student).select_related("subject")):
                if not m.subject:
                    continue
                score = _score_of(m, field)
                if score is not None:
                    total_marks = _get_record_max(model, m, field)
                    pct = (score / total_marks) * 100.0 if total_marks > 0 else 0.0
                    marks_data.append({
                        "subject_code": m.subject.code,
                        "subject_name": m.subject.name,
                        "assessment": label,
                        "score": score,
                        "max_mark": total_marks,
                        "score_pct": round(pct, 1),
                        "remark": get_remark(pct),
                        "_source": "obe",
                    })
                    obe_seen.add((m.subject.code or '', label))
    else:
        selected_model = Cia1Mark
        selected_field = "mark"
        for key, model, field in all_models:
            if key in exam:
                selected_model = model
                selected_field = field
                assessment_label = key
                break

        for m in _matches_subject(selected_model.objects.filter(student=student).select_related("subject")):
            if not m.subject:
                continue
            score = _score_of(m, selected_field)
            if score is not None:
                total_marks = _get_record_max(selected_model, m, selected_field)
                pct = (score / total_marks) * 100.0 if total_marks > 0 else 0.0
                marks_data.append({
                    "subject_code": m.subject.code,
                    "subject_name": m.subject.name,
                    "assessment": assessment_label,
                    "score": score,
                    "max_mark": total_marks,
                    "score_pct": round(pct, 1),
                    "remark": get_remark(pct),
                    "_source": "obe",
                })
                obe_seen.add((m.subject.code or '', assessment_label))
            else:
                marks_data.append({
                    "subject_code": m.subject.code,
                    "subject_name": m.subject.name,
                    "assessment": assessment_label,
                    "score": '—',
                    "max_mark": '—',
                    "score_pct": None,
                    "remark": '—',
                    "_source": "obe",
                })

    # ── Merge AcV2 published marks (authoritative over OBE) ──────────────────
    # Pass exam_type_filter so AcV2 results are pre-filtered to the same exam.
    # In ALL mode exam_type_filter='' returns all AcV2 published marks.
    acv2_rows = _fetch_acv2_marks(
        student,
        subject_filter=subject_filter,
        exam_type_filter=('' if exam in ('ALL', 'ALL ASSESSMENTS') else exam_type),
    )
    acv2_keys = set()
    for row in acv2_rows:
        key = (row.get('subject_code', '') or '', row.get('assessment', '') or '')
        acv2_keys.add(key)

    # If AcV2 has an entry for (subject, assessment), AcV2 is authoritative
    final_marks = [
        m for m in marks_data
        if (m.get('subject_code', '') or '', m.get('assessment', '') or '') not in acv2_keys
    ]
    final_marks.extend(acv2_rows)
    return final_marks


def fetch_scoped_acv2_student_marks(
    student_ids=None,
    dept_code=None,
    batch=None,
    sem_num=None,
    section_name=None,
    subject=None,
    exam_type=None,
):
    """
    Query published AcV2StudentMark records matching the filters.
    Returns a list of dicts with normalized percentage, actual max marks,
    configured pass determination, and all resolved relationships.
    Excludes absent/exempted records and empty assignments (total_mark IS NULL).
    """
    from academic_v2.models import AcV2StudentMark
    pass_threshold = _get_pass_threshold()
    target_key = _normalise_exam_key(exam_type)

    qs = AcV2StudentMark.objects.filter(
        exam_assignment__status='PUBLISHED',
        total_mark__isnull=False,
        is_absent=False,
        is_exempted=False,
    ).select_related(
        'student',
        'student__home_department',
        'student__section',
        'student__section__batch',
        'student__section__semester',
        'exam_assignment',
        'exam_assignment__section',
        'exam_assignment__section__course',
        'exam_assignment__section__course__semester',
        'exam_assignment__section__faculty_user',
        'exam_assignment__section__teaching_assignment',
        'exam_assignment__section__teaching_assignment__staff',
        'exam_assignment__section__teaching_assignment__staff__user',
        'exam_assignment__section__teaching_assignment__staff__department',
        'exam_assignment__section__teaching_assignment__section',
        'exam_assignment__section__teaching_assignment__section__managing_department',
        'exam_assignment__section__teaching_assignment__section__batch__course__department',
    )

    if student_ids is not None:
        qs = qs.filter(student_id__in=student_ids)

    results = []
    for sm in qs:
        ea = sm.exam_assignment
        if target_key and not _exam_key_matches(ea.exam, ea.exam_display_name, target_key):
            continue

        sec = ea.section
        course = sec.course if sec else None
        sem = course.semester.number if (course and course.semester) else None
        subj_code = (course.subject_code if course else '') or ''
        subj_name = (course.subject_name if course else '') or ''
        sec_lbl = sec.section_name if sec else ''

        stu_sec = getattr(sm.student, 'section', None)
        if sem is None and stu_sec and stu_sec.semester:
            sem = stu_sec.semester.number
        if not sec_lbl and stu_sec:
            sec_lbl = stu_sec.name or ''

        if sem_num is not None and sem != sem_num:
            continue
        if section_name and sec_lbl.lower() != section_name.lower():
            continue
        if subject:
            sub_str = (subj_code + ' ' + subj_name).lower()
            if subject.lower() not in sub_str:
                continue

        # Batch filter check
        if batch:
            stu_batch = sm.student.batch or (stu_sec.batch.name if stu_sec and stu_sec.batch else '')
            if batch.lower() not in stu_batch.lower():
                continue

        # Department resolution
        ta = sec.teaching_assignment if sec else None
        dept_obj = None
        if ta and getattr(ta, 'section', None):
            dept_obj = getattr(ta.section, 'managing_department', None)
            if not dept_obj and ta.section.batch and ta.section.batch.course:
                dept_obj = getattr(ta.section.batch.course, 'department', None)
        if not dept_obj and ta and getattr(ta, 'staff', None):
            dept_obj = getattr(ta.staff, 'department', None)
        if not dept_obj and sm.student.home_department:
            dept_obj = sm.student.home_department

        d_code = dept_obj.code or dept_obj.short_name if dept_obj else ''
        d_id = dept_obj.id if dept_obj else None

        if dept_code:
            dc = dept_code.lower()
            if dc not in (str(d_id or ''), (d_code or '').lower(), (dept_obj.name.lower() if dept_obj else '')):
                continue

        # Use the assignment's actual maximum marks for normalisation.
        # No hardcoded CIA/50 assumption: fall back to 100.0 only when the
        # stored max is missing or non-positive.
        try:
            mx = float(ea.max_marks) if ea.max_marks is not None else 0.0
        except (TypeError, ValueError):
            mx = 0.0
        if mx <= 0:
            mx = 100.0
        score = float(sm.total_mark)
        pct = min(100.0, (score / mx) * 100.0)

        results.append({
            'student_id': sm.student_id,
            'student_reg': sm.student.reg_no,
            'dept_id': d_id,
            'dept_code': d_code,
            'dept_name': dept_obj.name if dept_obj else '',
            'subject_code': subj_code,
            'subject_name': subj_name,
            'exam': ea.exam,
            'exam_display': ea.exam_display_name or ea.exam,
            'score': score,
            'max_mark': mx,
            'pct': pct,
            'is_pass': pct >= pass_threshold,
            'ta_id': ta.id if ta else None,
            'faculty_name': ta.staff.user.get_full_name() if (ta and ta.staff and ta.staff.user) else '',
        })

    return results
