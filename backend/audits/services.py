"""Helper functions for the audits app.

Centralizes role/permission resolution so views stay small and consistent.
"""
from django.utils import timezone

from academics.models import AcademicYear, DepartmentRole, StaffProfile

from .models import AuditATR, AuditQuestion, AuditScore


def user_is_superuser(user) -> bool:
    return bool(getattr(user, 'is_superuser', False))


def user_has_role(user, role_name: str) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    try:
        return user.roles.filter(name__iexact=role_name).exists()
    except Exception:
        return False


def user_is_iqac(user) -> bool:
    return user_is_superuser(user) or user_has_role(user, 'IQAC')


def get_user_staff_profile(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    try:
        return getattr(user, 'staff_profile', None)
    except Exception:
        return None


def get_user_department_ids(user) -> list:
    """Return the department ids the user manages (HOD/AHOD mappings + own dept)."""
    ids = set()
    staff = get_user_staff_profile(user)
    if not staff:
        return list(ids)

    # Own department (legacy field + current assignment)
    try:
        current = staff.current_department
        if current:
            ids.add(current.id)
    except Exception:
        pass

    try:
        active_ay = AcademicYear.objects.filter(is_active=True).first()
        for role in DepartmentRole.objects.filter(
            staff=staff,
            role__in=('HOD', 'AHOD'),
            is_active=True,
        ):
            if not active_ay or role.academic_year_id == active_ay.id:
                ids.add(role.department_id)
    except Exception:
        pass

    return list(ids)


def user_is_hod_for_assignment(user, assignment) -> bool:
    """True if the user is HOD/AHOD for the assignment's department."""
    if user_is_iqac(user):
        return True
    return assignment.department_id in get_user_department_ids(user)


def user_is_auditor_for_assignment(user, assignment) -> bool:
    staff = get_user_staff_profile(user)
    if not staff:
        return False
    try:
        return assignment.auditors.filter(pk=staff.pk).exists()
    except Exception:
        return False


def can_view_assignment(user, assignment) -> bool:
    if user_is_iqac(user):
        return True
    if user_is_auditor_for_assignment(user, assignment):
        return True
    return user_is_hod_for_assignment(user, assignment)


def can_manage_assignments(user) -> bool:
    """Only IQAC (and superusers) may create/update assignments."""
    return user_is_iqac(user)


def get_assignment_totals(assignment):
    """Return (total_marks, max_marks, percentage, below_threshold_count)."""
    scores = assignment.scores.select_related('question').all()
    total = 0.0
    maximum = 0.0
    below = 0
    for s in scores:
        try:
            marks = float(s.marks) if s.marks is not None else 0.0
        except (TypeError, ValueError):
            marks = 0.0
        try:
            maximum += float(s.question.max_marks)
        except (TypeError, ValueError):
            pass
        total += marks
        try:
            if s.marks is not None and float(s.marks) < float(s.question.max_marks) * 0.6:
                below += 1
        except (TypeError, ValueError):
            pass
    percentage = round((total / maximum) * 100, 2) if maximum else 0.0
    return total, maximum, percentage, below


def get_atr_required_scores(assignment):
    """Return scores whose marks are below 60% of the question's max marks."""
    required = []
    for s in assignment.scores.select_related('question').all():
        if s.marks is None:
            continue
        try:
            if float(s.marks) < float(s.question.max_marks) * 0.6:
                required.append(s)
        except (TypeError, ValueError):
            pass
    return required


def ensure_atr_rows(assignment):
    """Create AuditATR rows for every below-60% score if missing."""
    created = []
    for score in get_atr_required_scores(assignment):
        atr, was_created = AuditATR.objects.get_or_create(
            assignment=assignment,
            question=score.question,
        )
        if was_created:
            created.append(atr)
    return created


def build_question_rows(assignment, include_atr=False):
    """Build a question-by-question view of an assignment with scores and ATRs."""
    # Ensure we have a score row for every active question (auto-created lazily).
    all_questions = list(AuditQuestion.objects.filter(is_active=True).order_by('sl_no'))
    for q in all_questions:
        AuditScore.objects.get_or_create(assignment=assignment, question=q)

    if include_atr:
        ensure_atr_rows(assignment)

    score_by_question = {s.question_id: s for s in assignment.scores.select_related('question').all()}
    atrs = {a.question_id: a for a in assignment.atrs.select_related('question').all()}

    rows = []
    for q in all_questions:
        score = score_by_question.get(q.id)
        atr = atrs.get(q.id)
        rows.append({
            'question_id': q.id,
            'sl_no': q.sl_no,
            'details': q.details,
            'documents_checklist': q.documents_checklist,
            'detailed_description': q.detailed_description,
            'max_marks': str(q.max_marks),
            'marks': str(score.marks) if score and score.marks is not None else None,
            'comments': score.comments if score else '',
            'below_60': bool(
                score and score.marks is not None
                and float(score.marks) < float(q.max_marks) * 0.6
            ),
            'atr_action_taken': atr.action_taken if atr else '',
            'atr_status': atr.status if atr else 'PENDING',
            # Date of entry: only meaningful once marks have actually been entered
            'score_updated_at': (
                score.updated_at.isoformat()
                if score and score.marks is not None and score.updated_at else None
            ),
            'atr_submitted_at': (
                atr.submitted_at.isoformat()
                if atr and atr.submitted_at else None
            ),
        })
    return rows
