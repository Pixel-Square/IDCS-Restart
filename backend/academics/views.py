from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import transaction

from .models import AttendanceSession, AttendanceRecord, TeachingAssignment, Subject, StudentProfile
from .serializers import (
    AttendanceSessionSerializer,
    AttendanceRecordSerializer,
    BulkAttendanceRecordSerializer,
    TeachingAssignmentInfoSerializer,
    SubjectSerializer,
    StudentProfileSerializer,
)


class AttendanceSessionViewSet(viewsets.ModelViewSet):
    queryset = AttendanceSession.objects.select_related('teaching_assignment__subject', 'teaching_assignment__section', 'teaching_assignment__academic_year')
    serializer_class = AttendanceSessionSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        # staff: only their teaching assignments
        staff_profile = getattr(user, 'staff_profile', None)
        role_names = {r.name.upper() for r in user.roles.all()}
        if staff_profile and 'HOD' not in role_names and 'ADVISOR' not in role_names:
            return qs.filter(teaching_assignment__staff=staff_profile)
        # HOD/ADVISOR: restrict to department if staff_profile exists
        if staff_profile and ('HOD' in role_names or 'ADVISOR' in role_names):
            return qs.filter(teaching_assignment__section__semester__course__department=staff_profile.department)
        # otherwise admins can see all
        return qs

    def perform_create(self, serializer):
        serializer.context['request'] = self.request
        serializer.save()

    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        session = get_object_or_404(self.get_queryset(), pk=pk)
        # only owner/HOD/ADVISOR/admin can lock
        if not serializer_check_user_can_manage(request.user, session.teaching_assignment):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        session.is_locked = True
        session.save(update_fields=['is_locked'])
        return Response({'status': 'locked'})


class AttendanceRecordViewSet(viewsets.GenericViewSet):
    queryset = AttendanceRecord.objects.select_related('attendance_session__teaching_assignment', 'student__user')
    permission_classes = (IsAuthenticated,)
    serializer_class = AttendanceRecordSerializer

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        # Students: only their records
        student_profile = getattr(user, 'student_profile', None)
        if student_profile:
            return qs.filter(student=student_profile)
        # Staff: only records for sessions of their assignments
        staff_profile = getattr(user, 'staff_profile', None)
        role_names = {r.name.upper() for r in user.roles.all()}
        if staff_profile and 'HOD' not in role_names and 'ADVISOR' not in role_names:
            return qs.filter(attendance_session__teaching_assignment__staff=staff_profile)
        if staff_profile and ('HOD' in role_names or 'ADVISOR' in role_names):
            return qs.filter(attendance_session__teaching_assignment__section__semester__course__department=staff_profile.department)
        # admins see all
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page or queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        data = request.data
        many = isinstance(data, list)
        serializer = None
        if many:
            serializer = BulkAttendanceRecordSerializer(data=data, context={'request': request})
        else:
            serializer = AttendanceRecordSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            objs = serializer.save()
        if many:
            # return list of created records
            out_ser = AttendanceRecordSerializer(objs, many=True)
            return Response(out_ser.data, status=status.HTTP_201_CREATED)
        else:
            out_ser = AttendanceRecordSerializer(objs)
            return Response(out_ser.data, status=status.HTTP_201_CREATED)


def serializer_check_user_can_manage(user, teaching_assignment):
    # reuse logic from serializers helper if available; basic check here
    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile and teaching_assignment.staff_id == staff_profile.pk:
        return True
    role_names = {r.name.upper() for r in user.roles.all()}
    if 'HOD' in role_names or 'ADVISOR' in role_names:
        if staff_profile and staff_profile.department_id == teaching_assignment.section.semester.course.department_id:
            return True
    return False


class MyTeachingAssignmentsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        qs = TeachingAssignment.objects.select_related(
            'subject',
            'section',
            'academic_year',
            'section__semester__course__department',
        ).filter(is_active=True)

        staff_profile = getattr(user, 'staff_profile', None)
        role_names = {r.name.upper() for r in user.roles.all()}

        # staff: only their teaching assignments
        if staff_profile and 'HOD' not in role_names and 'ADVISOR' not in role_names:
            qs = qs.filter(staff=staff_profile)
        # HOD/ADVISOR: assignments within their department
        elif staff_profile and ('HOD' in role_names or 'ADVISOR' in role_names):
            qs = qs.filter(section__semester__course__department=staff_profile.department)
        # else: admins can see all

        ser = TeachingAssignmentInfoSerializer(qs.order_by('subject__code', 'section__name'), many=True)
        return Response(ser.data)


class SubjectViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Subject.objects.select_related('semester__course__department')
    serializer_class = SubjectSerializer
    # Allow anonymous read during local testing; switch back to IsAuthenticated for production
    permission_classes = ()

    def get_queryset(self):
        qs = super().get_queryset()
        code = self.request.query_params.get('code')
        if code:
            qs = qs.filter(code__iexact=code)
        return qs


class StudentProfileViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StudentProfile.objects.select_related('user', 'section')
    serializer_class = StudentProfileSerializer
    # Allow anonymous read during local testing; switch back to IsAuthenticated for production
    permission_classes = ()

    def get_queryset(self):
        qs = super().get_queryset()
        department = self.request.query_params.get('department')
        year = self.request.query_params.get('year')
        section = self.request.query_params.get('section')
        if department:
            qs = qs.filter(section__semester__course__department__name__iexact=department)
        if year:
            qs = qs.filter(section__semester__year=year)
        if section:
            qs = qs.filter(section__name__iexact=section)
        return qs
