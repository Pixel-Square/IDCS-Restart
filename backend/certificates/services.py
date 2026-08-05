import hashlib
from typing import Optional

from django.db.models import Q
from django.db import transaction
from django.utils import timezone

from accounts.models import UserNotification
from academics.models import DepartmentRole, SectionAdvisor, StudentMentorMap, StudentProfile, StaffProfile, StudentSectionAssignment

from .models import AchievementType, Certificate, CertificateAuditLog, CertificateStatus, StudentAchievement


def compute_file_hash(uploaded_file) -> str:
    digest = hashlib.sha256()
    try:
        if hasattr(uploaded_file, 'seek'):
            uploaded_file.seek(0)
        for chunk in uploaded_file.chunks() if hasattr(uploaded_file, 'chunks') else iter(lambda: uploaded_file.read(8192), b''):
            if not chunk:
                break
            digest.update(chunk)
        if hasattr(uploaded_file, 'seek'):
            uploaded_file.seek(0)
    except Exception:
        if hasattr(uploaded_file, 'seek'):
            uploaded_file.seek(0)
        raise
    return digest.hexdigest()


def get_student_mentor(student: StudentProfile) -> Optional[StaffProfile]:
    mapping = (
        StudentMentorMap.objects.filter(student=student, is_active=True)
        .select_related('mentor__user', 'mentor__department')
        .first()
    )
    return getattr(mapping, 'mentor', None) if mapping else None


def _student_department(student: StudentProfile):
    section = getattr(student, 'section', None)
    batch = getattr(section, 'batch', None) if section else None
    course = getattr(batch, 'course', None) if batch else None
    dept = getattr(course, 'department', None) if course else None
    if dept:
        return dept
    return getattr(student, 'home_department', None)


def _active_advisor_section_ids(staff: StaffProfile) -> list[int]:
    return list(SectionAdvisor.objects.filter(advisor=staff, is_active=True).values_list('section_id', flat=True))


def _student_in_advisor_scope(student: StudentProfile, advisor: StaffProfile) -> bool:
    section_ids = _active_advisor_section_ids(advisor)
    if not section_ids:
        return False
    if student.section_id in section_ids:
        return True
    return StudentSectionAssignment.objects.filter(
        student=student,
        section_id__in=section_ids,
        end_date__isnull=True,
    ).exists()


def _staff_departments(staff: StaffProfile) -> set[int]:
    dept_ids = set()
    staff_dept = getattr(staff, 'department', None)
    if staff_dept:
        dept_ids.add(staff_dept.id)
    dept_ids.update(
        DepartmentRole.objects.filter(staff=staff, is_active=True).values_list('department_id', flat=True)
    )
    return {int(v) for v in dept_ids if v}


@transaction.atomic
def create_certificate(*, student: StudentProfile, mentor: StaffProfile, actor, validated_data, uploaded_file):
    payload = dict(validated_data)
    payload.pop('file', None)
    file_hash = compute_file_hash(uploaded_file)
    certificate = Certificate.objects.create(
        student=student,
        mentor=mentor,
        file_hash=file_hash,
        file=uploaded_file,
        **payload,
    )
    CertificateAuditLog.objects.create(
        certificate=certificate,
        action=CertificateAuditLog.ACTION_UPLOADED,
        actor=actor,
        details={'file_hash': file_hash, 'mentor_id': getattr(mentor, 'id', None)},
    )
    return certificate


@transaction.atomic
def approve_certificate(*, certificate: Certificate, reviewer, mentor_profile: StaffProfile):
    now = timezone.now()
    certificate.status = CertificateStatus.APPROVED
    certificate.reviewer = reviewer
    certificate.reviewed_at = now
    certificate.rejection_reason = None
    certificate.rejection_message = ''
    certificate.save(update_fields=['status', 'reviewer', 'reviewed_at', 'rejection_reason', 'rejection_message', 'updated_at'])

    achievement, _ = StudentAchievement.objects.get_or_create(
        certificate=certificate,
        defaults={
            'student': certificate.student,
            'achievement_type': AchievementType.CERTIFICATION,
            'title': certificate.title,
            'description': '',
            'issuing_body': certificate.issuing_organization,
            'date_earned': certificate.issue_date,
            'verified_by': mentor_profile,
            'verified_at': now,
        },
    )
    if not _:
        achievement.student = certificate.student
        achievement.achievement_type = AchievementType.CERTIFICATION
        achievement.title = certificate.title
        achievement.description = ''
        achievement.issuing_body = certificate.issuing_organization
        achievement.date_earned = certificate.issue_date
        achievement.verified_by = mentor_profile
        achievement.verified_at = now
        achievement.save()

    CertificateAuditLog.objects.create(
        certificate=certificate,
        action=CertificateAuditLog.ACTION_APPROVED,
        actor=reviewer,
        details={'achievement_id': achievement.id},
    )

    UserNotification.objects.create(
        user=certificate.student.user,
        title='Certificate Approved',
        message=f"Your certificate '{certificate.title}' has been approved.",
        link='/student/certificates',
        data={'type': 'certificate_approved', 'certificate_id': certificate.id},
    )
    return certificate, achievement


@transaction.atomic
def reject_certificate(*, certificate: Certificate, reviewer, rejection_reason: str, rejection_message: str):
    now = timezone.now()
    certificate.status = CertificateStatus.REJECTED
    certificate.reviewer = reviewer
    certificate.reviewed_at = now
    certificate.rejection_reason = rejection_reason
    certificate.rejection_message = rejection_message or ''
    certificate.save(update_fields=['status', 'reviewer', 'reviewed_at', 'rejection_reason', 'rejection_message', 'updated_at'])

    CertificateAuditLog.objects.create(
        certificate=certificate,
        action=CertificateAuditLog.ACTION_REJECTED,
        actor=reviewer,
        details={'rejection_reason': rejection_reason, 'message': rejection_message or ''},
    )

    UserNotification.objects.create(
        user=certificate.student.user,
        title='Certificate Rejected',
        message=f"Your certificate '{certificate.title}' was rejected.",
        link='/student/certificates',
        data={
            'type': 'certificate_rejected',
            'certificate_id': certificate.id,
            'rejection_reason': rejection_reason,
            'rejection_message': rejection_message or '',
        },
    )
    return certificate


def visible_certificates_for_user(user):
    if getattr(user, 'is_superuser', False):
        return Certificate.objects.all()

    student = getattr(user, 'student_profile', None)
    if student is not None:
        return Certificate.objects.filter(student=student)

    staff = getattr(user, 'staff_profile', None)
    if staff is None:
        return Certificate.objects.none()

    role_names = {r.name.upper() for r in user.roles.all()} if getattr(user, 'roles', None) is not None else set()
    if 'IQAC' in role_names:
        return Certificate.objects.all()

    if 'HOD' in role_names:
        dept_ids = _staff_departments(staff)
        if not dept_ids:
            return Certificate.objects.none()
        return Certificate.objects.filter(
            Q(student__section__batch__course__department_id__in=dept_ids) |
            Q(student__home_department_id__in=dept_ids)
        )

    if 'ADVISOR' in role_names:
        section_ids = _active_advisor_section_ids(staff)
        if not section_ids:
            return Certificate.objects.none()
        return Certificate.objects.filter(student__section_id__in=section_ids)

    if 'MENTOR' in role_names:
        student_ids = StudentMentorMap.objects.filter(mentor=staff, is_active=True).values_list('student_id', flat=True)
        return Certificate.objects.filter(student_id__in=list(student_ids))

    return Certificate.objects.none()


def visible_achievements_for_user(user):
    cert_qs = visible_certificates_for_user(user)
    return StudentAchievement.objects.filter(certificate__in=cert_qs).select_related('student__user', 'certificate', 'verified_by__user')


def mentor_pending_review_queryset(staff: StaffProfile):
    student_ids = StudentMentorMap.objects.filter(mentor=staff, is_active=True).values_list('student_id', flat=True)
    return Certificate.objects.filter(student_id__in=list(student_ids), status=CertificateStatus.PENDING_MENTOR_REVIEW).select_related('student__user', 'mentor__user')


def advisee_achievement_queryset(staff: StaffProfile):
    section_ids = _active_advisor_section_ids(staff)
    if not section_ids:
        return StudentAchievement.objects.none()
    return StudentAchievement.objects.filter(student__section_id__in=section_ids).select_related('student__user', 'certificate', 'verified_by__user')


def department_achievement_queryset(staff: StaffProfile):
    dept_ids = _staff_departments(staff)
    if not dept_ids:
        return StudentAchievement.objects.none()
    return StudentAchievement.objects.filter(
        Q(student__section__batch__course__department_id__in=dept_ids)
        | Q(student__home_department_id__in=dept_ids)
    ).select_related('student__user', 'certificate', 'verified_by__user')


def mentor_achievement_queryset(staff: StaffProfile):
    student_ids = StudentMentorMap.objects.filter(mentor=staff, is_active=True).values_list('student_id', flat=True)
    return StudentAchievement.objects.filter(student_id__in=list(student_ids)).select_related('student__user', 'certificate', 'verified_by__user')
