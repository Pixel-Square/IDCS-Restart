import csv

from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import StudentProfile, StaffProfile, StudentMentorMap

from .models import Certificate, CertificateStatus, StudentAchievement
from .permissions import IsCertificateAdvisor, IsCertificateHOD, IsCertificateIQAC, IsCertificateMentor, IsCertificateStudent, is_iqac_user
from .serializers import CertificateAuditLogSerializer, CertificateReviewSerializer, CertificateSerializer, CertificateUploadSerializer, StudentAchievementSerializer
from .services import advisee_achievement_queryset, approve_certificate, create_certificate, department_achievement_queryset, mentor_pending_review_queryset, reject_certificate, visible_certificates_for_user


def _current_staff(user):
    return getattr(user, 'staff_profile', None)


def _current_student(user):
    return getattr(user, 'student_profile', None)


def _serialize_certificates(qs):
    return CertificateSerializer(qs, many=True, context={}).data


def _serialize_achievements(qs):
    return StudentAchievementSerializer(qs, many=True, context={}).data


class CertificateUploadView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateStudent)
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def post(self, request):
        student = _current_student(request.user)
        if not student:
            return Response({'detail': 'Student profile not found.'}, status=status.HTTP_400_BAD_REQUEST)

        mentor = StudentMentorMap.objects.filter(student=student, is_active=True).select_related('mentor__user').first()
        if not mentor:
            return Response({'detail': 'No active mentor is assigned to your profile.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CertificateUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        certificate = create_certificate(
            student=student,
            mentor=mentor.mentor,
            actor=request.user,
            validated_data=serializer.validated_data,
            uploaded_file=request.FILES.get('file') or serializer.validated_data['file'],
        )
        return Response(CertificateSerializer(certificate).data, status=status.HTTP_201_CREATED)


class MyCertificatesView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateStudent)

    def get(self, request):
        student = _current_student(request.user)
        certs = Certificate.objects.filter(student=student).select_related('student__user', 'mentor__user', 'reviewer', 'achievement__verified_by__user')
        return Response({'results': _serialize_certificates(certs)})


class PendingReviewView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateMentor)

    def get(self, request):
        staff = _current_staff(request.user)
        certs = mentor_pending_review_queryset(staff)
        return Response({'results': _serialize_certificates(certs)})


class MentorAchievementsView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateMentor)

    def get(self, request):
        staff = _current_staff(request.user)
        achievements = mentor_achievement_queryset(staff)
        return Response({'results': _serialize_achievements(achievements)})


class ApproveCertificateView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateMentor)

    def post(self, request, pk: int):
        staff = _current_staff(request.user)
        certificate = Certificate.objects.select_related('student__user', 'mentor__user').filter(pk=pk).first()
        if not certificate:
            return Response({'detail': 'Certificate not found.'}, status=status.HTTP_404_NOT_FOUND)
        if certificate.mentor_id != getattr(staff, 'id', None):
            return Response({'detail': 'You are not allowed to review this certificate.'}, status=status.HTTP_403_FORBIDDEN)
        if certificate.status != CertificateStatus.PENDING_MENTOR_REVIEW:
            return Response({'detail': 'This certificate has already been reviewed.'}, status=status.HTTP_400_BAD_REQUEST)
        certificate, achievement = approve_certificate(certificate=certificate, reviewer=request.user, mentor_profile=staff)
        payload = CertificateSerializer(certificate).data
        payload['achievement'] = StudentAchievementSerializer(achievement).data
        return Response(payload)


class RejectCertificateView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateMentor)

    def post(self, request, pk: int):
        staff = _current_staff(request.user)
        certificate = Certificate.objects.select_related('student__user', 'mentor__user').filter(pk=pk).first()
        if not certificate:
            return Response({'detail': 'Certificate not found.'}, status=status.HTTP_404_NOT_FOUND)
        if certificate.mentor_id != getattr(staff, 'id', None):
            return Response({'detail': 'You are not allowed to review this certificate.'}, status=status.HTTP_403_FORBIDDEN)
        if certificate.status != CertificateStatus.PENDING_MENTOR_REVIEW:
            return Response({'detail': 'This certificate has already been reviewed.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CertificateReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reject_certificate(
            certificate=certificate,
            reviewer=request.user,
            rejection_reason=serializer.validated_data.get('rejection_reason') or '',
            rejection_message=serializer.validated_data.get('rejection_message') or '',
        )
        return Response(CertificateSerializer(certificate).data)


class MenteeAchievementsView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateMentor)

    def get(self, request, student_id: int):
        staff = _current_staff(request.user)
        student = StudentProfile.objects.select_related('user', 'section').filter(pk=student_id).first()
        if not student:
            return Response({'results': []})
        if not StudentMentorMap.objects.filter(student=student, mentor=staff, is_active=True).exists():
            return Response({'detail': 'You can only view your mentees.'}, status=status.HTTP_403_FORBIDDEN)
        achievements = StudentAchievement.objects.filter(student=student).select_related('student__user', 'certificate', 'verified_by__user')
        return Response({'results': _serialize_achievements(achievements)})


class AdviseeAchievementsView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateAdvisor)

    def get(self, request, student_id=None):
        staff = _current_staff(request.user)
        achievements = advisee_achievement_queryset(staff)
        if student_id:
            achievements = achievements.filter(student_id=student_id)
        return Response({'results': _serialize_achievements(achievements)})


class DepartmentAchievementsView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateHOD)

    def get(self, request):
        staff = _current_staff(request.user)
        achievements = department_achievement_queryset(staff)
        return Response({'results': _serialize_achievements(achievements)})


class AllAchievementsView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateIQAC)

    def get(self, request):
        achievements = StudentAchievement.objects.select_related('student__user', 'certificate', 'verified_by__user').all()
        return Response({'results': _serialize_achievements(achievements)})


class CertificateStatsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        staff = _current_staff(request.user)
        student = _current_student(request.user)
        if student is not None:
            certs = Certificate.objects.filter(student=student)
        else:
            certs = visible_certificates_for_user(request.user)

        total = certs.count()
        approved = certs.filter(status=CertificateStatus.APPROVED).count()
        pending = certs.filter(status=CertificateStatus.PENDING_MENTOR_REVIEW).count()
        rejected = certs.filter(status=CertificateStatus.REJECTED).count()

        return Response({'total': total, 'approved': approved, 'pending': pending, 'rejected': rejected})


class CertificateReportsView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateIQAC)

    def get(self, request):
        certs = Certificate.objects.select_related('student__user', 'mentor__user', 'reviewer').all()
        achievements = StudentAchievement.objects.select_related('student__user', 'certificate', 'verified_by__user').all()
        audit_logs = []
        for cert in certs.order_by('-created_at')[:200]:
            audit_logs.extend(list(cert.audit_logs.all()[:5]))
        report = {
            'summary': {
                'certificates': certs.count(),
                'approved': certs.filter(status=CertificateStatus.APPROVED).count(),
                'pending': certs.filter(status=CertificateStatus.PENDING_MENTOR_REVIEW).count(),
                'rejected': certs.filter(status=CertificateStatus.REJECTED).count(),
                'achievements': achievements.count(),
                'top_certificate_types': list(certs.values('certificate_type').annotate(total=Count('id')).order_by('-total')[:10]),
            },
            'recent_achievements': _serialize_achievements(achievements[:50]),
            'recent_audit_logs': CertificateAuditLogSerializer(audit_logs, many=True).data,
        }
        return Response(report)


class CertificateReportsExportView(APIView):
    permission_classes = (IsAuthenticated, IsCertificateIQAC)

    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="certificate_reports.csv"'
        writer = csv.writer(response)
        writer.writerow(['certificate_id', 'student_reg_no', 'student_name', 'title', 'type', 'status', 'mentor', 'reviewed_at'])
        for cert in Certificate.objects.select_related('student__user', 'mentor__user', 'reviewer').all().order_by('-created_at'):
            student_user = getattr(cert.student, 'user', None)
            student_name = ''
            if student_user:
                student_name = f"{getattr(student_user, 'first_name', '')} {getattr(student_user, 'last_name', '')}".strip() or getattr(student_user, 'username', '')
            mentor_user = getattr(cert.mentor, 'user', None)
            writer.writerow([
                cert.id,
                getattr(cert.student, 'reg_no', ''),
                student_name,
                cert.title,
                cert.get_certificate_type_display(),
                cert.get_status_display(),
                getattr(mentor_user, 'username', ''),
                cert.reviewed_at.isoformat() if cert.reviewed_at else '',
            ])
        return response


class StaffAchievementStatsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, staff_id: int):
        staff = StaffProfile.objects.filter(pk=staff_id).select_related('user').first()
        if not staff:
            return Response({'detail': 'Staff not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not (is_iqac_user(request.user) or getattr(request.user, 'staff_profile', None) == staff):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        mentee_ids = list(StudentMentorMap.objects.filter(mentor=staff, is_active=True).values_list('student_id', flat=True))
        certs = Certificate.objects.filter(student_id__in=mentee_ids)
        achievements = StudentAchievement.objects.filter(student_id__in=mentee_ids)
        return Response({
            'staff_id': staff.id,
            'staff_name': getattr(getattr(staff, 'user', None), 'username', None),
            'mentee_count': len(mentee_ids),
            'certificate_count': certs.count(),
            'achievement_count': achievements.count(),
            'approved_count': certs.filter(status=CertificateStatus.APPROVED).count(),
            'pending_count': certs.filter(status=CertificateStatus.PENDING_MENTOR_REVIEW).count(),
            'rejected_count': certs.filter(status=CertificateStatus.REJECTED).count(),
        })
