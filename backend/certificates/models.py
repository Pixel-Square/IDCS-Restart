import os

from django.db import models
from django.conf import settings
from django.utils import timezone


def certificate_upload_path(instance, filename):
    filename = os.path.basename(filename or 'certificate')
    base, ext = os.path.splitext(filename)
    ext = ext.lower() or '.bin'
    return f'certificates/{timezone.now():%Y/%m}/{instance.student_id}/{base or "certificate"}{ext}'


class CertificateStatus(models.TextChoices):
    PENDING_MENTOR_REVIEW = 'PENDING_MENTOR_REVIEW', 'Pending Mentor Review'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'


class CertificateType(models.TextChoices):
    COURSE_COMPLETION = 'COURSE_COMPLETION', 'Course Completion'
    WORKSHOP = 'WORKSHOP', 'Workshop'
    SEMINAR = 'SEMINAR', 'Seminar'
    HACKATHON = 'HACKATHON', 'Hackathon'
    COMPETITION = 'COMPETITION', 'Competition'
    INTERNSHIP = 'INTERNSHIP', 'Internship'
    ONLINE_COURSE = 'ONLINE_COURSE', 'Online Course'
    CONFERENCE = 'CONFERENCE', 'Conference'
    CERTIFICATION = 'CERTIFICATION', 'Professional Certification'
    AWARD = 'AWARD', 'Award'
    OTHER = 'OTHER', 'Other'


class RejectionReason(models.TextChoices):
    INVALID_FORMAT = 'INVALID_FORMAT', 'Invalid document format'
    UNCLEAR = 'UNCLEAR', 'Certificate unclear'
    UNRECOGNISED_ORG = 'UNRECOGNISED_ORG', 'Organization not recognized'
    OUTSIDE_SCOPE = 'OUTSIDE_SCOPE', 'Outside scope'
    DUPLICATE = 'DUPLICATE', 'Already submitted'
    OTHER = 'OTHER', 'Custom'


class AchievementType(models.TextChoices):
    CERTIFICATION = 'CERTIFICATION', 'Certification'
    EVENT_BADGE = 'EVENT_BADGE', 'Event Badge'
    AWARD = 'AWARD', 'Award'
    WORKSHOP = 'WORKSHOP', 'Workshop'
    INTERNSHIP = 'INTERNSHIP', 'Internship'
    OTHER = 'OTHER', 'Other'


class Certificate(models.Model):
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='certificates')
    mentor = models.ForeignKey('academics.StaffProfile', on_delete=models.CASCADE, related_name='mentee_certificates')
    certificate_type = models.CharField(max_length=40, choices=CertificateType.choices)
    title = models.CharField(max_length=255)
    issuing_organization = models.CharField(max_length=255)
    issue_date = models.DateField()
    expiry_date = models.DateField(null=True, blank=True)
    file = models.FileField(upload_to=certificate_upload_path)
    file_hash = models.CharField(max_length=64, db_index=True)
    status = models.CharField(max_length=32, choices=CertificateStatus.choices, default=CertificateStatus.PENDING_MENTOR_REVIEW)
    rejection_reason = models.CharField(max_length=64, choices=RejectionReason.choices, null=True, blank=True)
    rejection_message = models.TextField(max_length=500, blank=True, default='')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_certificates')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['student', 'status', '-created_at']),
            models.Index(fields=['mentor', 'status', '-created_at']),
            models.Index(fields=['file_hash']),
        ]

    def __str__(self):
        return f'{self.title} - {self.student.reg_no if self.student_id else self.student_id}'


class StudentAchievement(models.Model):
    student = models.ForeignKey('academics.StudentProfile', on_delete=models.CASCADE, related_name='achievements')
    certificate = models.OneToOneField(Certificate, on_delete=models.CASCADE, related_name='achievement')
    achievement_type = models.CharField(max_length=32, choices=AchievementType.choices)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    issuing_body = models.CharField(max_length=255)
    date_earned = models.DateField()
    verified_by = models.ForeignKey('academics.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_achievements')
    verified_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_earned', '-created_at']
        indexes = [models.Index(fields=['student', '-date_earned'])]

    def __str__(self):
        return f'{self.title} - {self.student.reg_no if self.student_id else self.student_id}'


class CertificateAuditLog(models.Model):
    ACTION_UPLOADED = 'UPLOADED'
    ACTION_APPROVED = 'APPROVED'
    ACTION_REJECTED = 'REJECTED'
    ACTION_RE_UPLOADED = 'RE_UPLOADED'

    ACTION_CHOICES = [
        (ACTION_UPLOADED, 'Uploaded'),
        (ACTION_APPROVED, 'Approved'),
        (ACTION_REJECTED, 'Rejected'),
        (ACTION_RE_UPLOADED, 'Re-uploaded'),
    ]

    certificate = models.ForeignKey(Certificate, on_delete=models.CASCADE, related_name='audit_logs')
    action = models.CharField(max_length=24, choices=ACTION_CHOICES)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='certificate_audit_logs')
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.action} - {self.certificate_id}'
