from rest_framework import serializers
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import TeachingAssignment
from academics.models import Subject, Section
from accounts.utils import get_user_permissions
from academics.models import SectionAdvisor, StaffProfile
from academics.models import AcademicYear
from django.core.exceptions import ValidationError
from rest_framework.validators import UniqueTogetherValidator
from academics.models import StudentProfile, DayAttendanceSession, DayAttendanceRecord


class TeachingAssignmentInfoSerializer(serializers.ModelSerializer):
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    academic_year = serializers.CharField(source='academic_year.name', read_only=True)
    curriculum_row = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = ('id', 'subject_code', 'subject_name', 'section_name', 'academic_year', 'curriculum_row')

    def get_curriculum_row(self, obj):
        # Try to find a matching CurriculumDepartment row for the Subject
        try:
            from curriculum.models import CurriculumDepartment
            dept = None
            try:
                dept = obj.section.batch.course.department
            except Exception:
                dept = None
            qs = CurriculumDepartment.objects.filter(models.Q(course_code__iexact=obj.subject.code) | models.Q(course_name__iexact=obj.subject.name))
            if dept is not None:
                qs = qs.filter(department=dept)
            row = qs.first()
            if not row:
                return None
            return {'id': row.pk, 'course_code': row.course_code, 'course_name': row.course_name}
        except Exception:
            return None


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    # Accept curriculum_department row id to link directly
    curriculum_row_id = serializers.IntegerField(write_only=True, required=False)
    staff_id = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all(), source='staff', write_only=True)
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section', write_only=True)
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False)
    subject = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = ('id', 'staff_id', 'section_id', 'academic_year', 'subject', 'curriculum_row_id', 'is_active')

    def get_subject(self, obj):
        # prefer curriculum row display
        try:
            if getattr(obj, 'curriculum_row', None):
                row = obj.curriculum_row
                return f"{row.course_code or ''} - {row.course_name or ''}".strip(' -')
            if getattr(obj, 'subject', None):
                return getattr(obj.subject, 'name', str(obj.subject))
            # fallback: try to pick a curriculum row for the section's department
            try:
                dept = obj.section.batch.course.department
            except Exception:
                dept = None
            if dept is not None:
                from curriculum.models import CurriculumDepartment
                row = CurriculumDepartment.objects.filter(department=dept).first()
                if row:
                    return f"{row.course_code or ''} - {row.course_name or ''}".strip(' -')
        except Exception:
            pass
        return None

    def validate(self, attrs):
        # ensure staff belongs to section's department
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        staff = attrs.get('staff')
        section = attrs.get('section')
        # NOTE: department membership is no longer required; allow assigning
        # staff across departments. Any department-level permission checks
        # should be enforced via HOD/Role checks elsewhere.
        return attrs

    def create(self, validated_data):
        # If curriculum_row_id provided, attach that instead of creating a Subject
        curriculum_row_id = self.initial_data.get('curriculum_row_id')
        if curriculum_row_id:
            try:
                from curriculum.models import CurriculumDepartment
                row = CurriculumDepartment.objects.filter(pk=int(curriculum_row_id)).first()
                if row:
                    validated_data['curriculum_row'] = row
            except Exception:
                pass

        # If no academic_year provided, prefer active academic year
        if 'academic_year' not in validated_data or not validated_data.get('academic_year'):
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()
            if ay:
                validated_data['academic_year'] = ay

        # ensure we don't pass unknown write-only fields
        validated_data.pop('curriculum_row_id', None)
        # If a curriculum_row was provided, and there's already an active
        # TeachingAssignment for the same curriculum_row+section+academic_year,
        # update that record to point to the new staff instead of creating a
        # duplicate mapping.
        row = validated_data.get('curriculum_row')
        section = validated_data.get('section')
        ay = validated_data.get('academic_year')
        staff = validated_data.get('staff')

        if row and section and ay and staff:
            try:
                with transaction.atomic():
                    existing = TeachingAssignment.objects.filter(curriculum_row=row, section=section, academic_year=ay, is_active=True).first()
                    if existing:
                        # update staff and is_active flag (if provided)
                        existing.staff = staff
                        if 'is_active' in validated_data:
                            existing.is_active = validated_data.get('is_active')
                        existing.save()
                        return existing
            except Exception:
                # fall back to normal create on error
                pass

        return super().create(validated_data)





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
        # check department match using DepartmentRole entries so staff may
        # be HOD of multiple departments (don't rely on single profile.department)
        try:
            if staff_profile:
                from .models import DepartmentRole
                hod_depts = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True)
                ta_dept = teaching_assignment.section.batch.course.department_id
                return ta_dept in list(hod_depts)
        except Exception:
            pass
    return False


class SectionAdvisorSerializer(serializers.ModelSerializer):
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section', write_only=True)
    advisor_id = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all(), source='advisor', write_only=True)
    section = serializers.StringRelatedField(read_only=True)
    advisor = serializers.StringRelatedField(read_only=True)
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False, allow_null=True)

    class Meta:
        model = SectionAdvisor
        fields = ('id', 'section', 'section_id', 'advisor', 'advisor_id', 'academic_year', 'is_active')

    def __init__(self, *args, **kwargs):
        # Remove UniqueTogetherValidator for (section, academic_year) so we can
        # handle updates of existing active mappings in `create()` instead.
        super().__init__(*args, **kwargs)
        new_validators = []
        for v in list(self.validators):
            if isinstance(v, UniqueTogetherValidator):
                fields = getattr(v, 'fields', None)
                if fields and set(fields) == {'section', 'academic_year'}:
                    # skip this validator
                    continue
            new_validators.append(v)
        self.validators = new_validators

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        section = attrs.get('section') or getattr(self.instance, 'section', None)
        advisor = attrs.get('advisor') or getattr(self.instance, 'advisor', None)
        academic_year = attrs.get('academic_year') or getattr(self.instance, 'academic_year', None)

        # If client omitted academic_year, default to the active AcademicYear
        if not academic_year:
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()
            if ay:
                attrs['academic_year'] = ay
                academic_year = ay

        # Basic presence
        if not section or not advisor or not academic_year:
            raise ValidationError('section, advisor and academic_year are required')

        # advisor must belong to the same department as section
        # Advisor department membership is not enforced here; HOD checks
        # and DepartmentRole determine who may assign advisors.

        # user must be HOD for the department
        hod_depts = []
        if user and getattr(user, 'staff_profile', None):
            from academics.models import DepartmentRole
            hod_depts = list(DepartmentRole.objects.filter(staff=user.staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True))
        if not hod_depts or (sec_dept and sec_dept.id not in hod_depts):
            raise ValidationError('Only HODs of the section department may assign advisors')

        return attrs

    def create(self, validated_data):
        SectionAdvisorModel = self.Meta.model
        section = validated_data.get('section')
        academic_year = validated_data.get('academic_year')
        advisor = validated_data.get('advisor')
        is_active = validated_data.get('is_active', True)

        if section and academic_year and advisor:
            # update existing active mapping for the exact year if present
            existing = SectionAdvisorModel.objects.filter(section=section, academic_year=academic_year, is_active=True).first()
            if existing:
                existing.advisor = advisor
                existing.is_active = is_active
                existing.save()
            else:
                existing = SectionAdvisorModel.objects.create(section=section, academic_year=academic_year, advisor=advisor, is_active=is_active)


            return existing

        return super().create(validated_data)

    def update(self, instance, validated_data):
        return super().update(instance, validated_data)

class StudentSimpleSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    reg_no = serializers.CharField()
    username = serializers.CharField(source='user.username')
    section_id = serializers.IntegerField(allow_null=True)
    section_name = serializers.CharField(allow_null=True)


class DayAttendanceRecordSerializer(serializers.ModelSerializer):
    student_id = serializers.PrimaryKeyRelatedField(queryset=StudentProfile.objects.all(), source='student', write_only=True)
    student = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = DayAttendanceRecord
        fields = ('id', 'session', 'student', 'student_id', 'status', 'marked_at', 'marked_by')
        read_only_fields = ('marked_at', 'marked_by')


class BulkDayAttendanceSerializer(serializers.Serializer):
    section_id = serializers.IntegerField(write_only=True)
    date = serializers.DateField()
    records = DayAttendanceRecordSerializer(many=True)

    def validate(self, attrs):
        # Basic validation ensuring records correspond to students in the section
        section_id = attrs.get('section_id')
        records = attrs.get('records', [])
        # Collect student ids in payload
        stud_ids = [r.get('student').id if isinstance(r.get('student'), StudentProfile) else r.get('student_id') for r in records]
        # Optionally add extra validation later
        return attrs


class DayAttendanceSessionSerializer(serializers.ModelSerializer):
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section', write_only=True)
    section = serializers.StringRelatedField(read_only=True)
    records = DayAttendanceRecordSerializer(many=True, read_only=True)

    class Meta:
        model = DayAttendanceSession
        fields = ('id', 'section', 'section_id', 'date', 'created_by', 'is_locked', 'created_at', 'records')
        read_only_fields = ('created_by', 'created_at')


 
