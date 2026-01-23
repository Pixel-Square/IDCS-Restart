from rest_framework import serializers
from django.db import IntegrityError
from django.utils import timezone

from .models import AttendanceSession, AttendanceRecord, TeachingAssignment
from academics.models import Subject, Section
from accounts.utils import get_user_permissions


class TeachingAssignmentInfoSerializer(serializers.ModelSerializer):
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    academic_year = serializers.CharField(source='academic_year.name', read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = ('id', 'subject_code', 'subject_name', 'section_name', 'academic_year')


class AttendanceSessionSerializer(serializers.ModelSerializer):
    teaching_assignment = TeachingAssignmentInfoSerializer(read_only=True)
    teaching_assignment_id = serializers.PrimaryKeyRelatedField(
        queryset=TeachingAssignment.objects.all(), source='teaching_assignment', write_only=True
    )
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = AttendanceSession
        fields = ('id', 'teaching_assignment', 'teaching_assignment_id', 'date', 'period', 'created_by', 'is_locked', 'created_at')
        read_only_fields = ('id', 'created_at', 'created_by', 'is_locked')

    def validate(self, attrs):
        # Prevent duplicate sessions for same teaching_assignment+date+period
        ta = attrs.get('teaching_assignment') or getattr(self.instance, 'teaching_assignment', None)
        date = attrs.get('date') or getattr(self.instance, 'date', None)
        period = attrs.get('period') if 'period' in attrs else getattr(self.instance, 'period', None)
        if ta and date:
            qs = AttendanceSession.objects.filter(teaching_assignment=ta, date=date, period=period)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError('An attendance session for this teaching assignment/date/period already exists.')
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        # enforce that only staff owning the teaching assignment or HOD/advisor can create
        ta = validated_data['teaching_assignment']
        if not _user_can_manage_assignment(user, ta):
            raise serializers.ValidationError('You do not have permission to create a session for this teaching assignment.')
        validated_data['created_by'] = user
        return super().create(validated_data)


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_reg_no = serializers.CharField(source='student.reg_no', read_only=True)
    attendance_session_id = serializers.PrimaryKeyRelatedField(queryset=AttendanceSession.objects.all(), source='attendance_session', write_only=True)

    class Meta:
        model = AttendanceRecord
        fields = ('id', 'attendance_session_id', 'student', 'student_reg_no', 'status', 'marked_at')
        read_only_fields = ('id', 'marked_at', 'student_reg_no')

    def validate(self, attrs):
        session = attrs.get('attendance_session') or getattr(self.instance, 'attendance_session', None)
        student = attrs.get('student') or getattr(self.instance, 'student', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        if session is None or student is None:
            return attrs

        # session must be unlocked
        if session.is_locked:
            raise serializers.ValidationError('Attendance session is locked; cannot mark attendance.')

        # only staff owning session (or HOD/advisor) can mark
        if not _user_can_manage_assignment(user, session.teaching_assignment):
            raise serializers.ValidationError('You do not have permission to mark attendance for this session.')

        # prevent duplicate record
        if AttendanceRecord.objects.filter(attendance_session=session, student=student).exists():
            raise serializers.ValidationError('Attendance for this student is already recorded for the session.')

        return attrs

    def create(self, validated_data):
        # rely on validate to have checked duplicates and permissions
        try:
            return super().create(validated_data)
        except IntegrityError:
            raise serializers.ValidationError('Could not create attendance record (possible duplicate).')


class BulkAttendanceRecordSerializer(serializers.ListSerializer):
    child = AttendanceRecordSerializer()

    def create(self, validated_data):
        # All records should belong to the same session; enforce that
        if not validated_data:
            return []
        session = validated_data[0]['attendance_session']
        for item in validated_data:
            if item['attendance_session'].pk != session.pk:
                raise serializers.ValidationError('All attendance records in a bulk request must belong to the same session.')
        # create after double-checking duplicates
        objs = []
        for item in validated_data:
            if AttendanceRecord.objects.filter(attendance_session=session, student=item['student']).exists():
                continue
            objs.append(AttendanceRecord(**item))
        AttendanceRecord.objects.bulk_create(objs)
        return objs


def _user_can_manage_assignment(user, teaching_assignment: TeachingAssignment) -> bool:
    """Return True if `user` is allowed to manage the given teaching_assignment.

    Rules:
    - staff users can manage only their own assignments
    - users with role 'HOD' can manage assignments within their department
    - users with role 'ADVISOR' are not explicitly modeled; treat same as HOD if they have staff_profile
    """
    if user is None or not user.is_authenticated:
        return False
    # direct staff owner
    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile and teaching_assignment.staff_id == staff_profile.pk:
        return True
    # role-based HOD/ADVISOR check
    role_names = {r.name.upper() for r in user.roles.all()}
    if 'HOD' in role_names or 'ADVISOR' in role_names:
        # check department match
        if staff_profile and staff_profile.department_id:
            ta_dept = teaching_assignment.section.semester.course.department_id
            return staff_profile.department_id == ta_dept
    return False
