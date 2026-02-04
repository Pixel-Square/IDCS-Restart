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
from academics.models import StudentProfile
from academics.models import PeriodAttendanceSession, PeriodAttendanceRecord
from timetable.models import TimetableSlot


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ('id', 'name', 'is_active', 'parity')


class TeachingAssignmentInfoSerializer(serializers.ModelSerializer):
    subject_code = serializers.SerializerMethodField(read_only=True)
    subject_name = serializers.SerializerMethodField(read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    section_id = serializers.IntegerField(source='section.id', read_only=True)
    curriculum_row_id = serializers.SerializerMethodField(read_only=True)
    batch = serializers.SerializerMethodField(read_only=True)
    semester = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TeachingAssignment
        # removed curriculum_row and academic_year as requested; include batch & semester
        fields = ('id', 'subject_code', 'subject_name', 'section_name', 'section_id', 'curriculum_row_id', 'batch', 'semester')

    def _curriculum_row_for_obj(self, obj):
        # helper: try to find a matching CurriculumDepartment row for the assignment
        try:
            from curriculum.models import CurriculumDepartment
            dept = None
            try:
                dept = obj.section.batch.course.department
            except Exception:
                dept = None
            # if subject exists, prefer matching by code/name
            subj_code = getattr(getattr(obj, 'subject', None), 'code', None)
            subj_name = getattr(getattr(obj, 'subject', None), 'name', None)
            # Only attempt to find a CurriculumDepartment when the assignment
            # has an explicit Subject with a code/name. Do not fallback to the
            # department's first curriculum row — that can produce unrelated
            # subjects for assignments with no explicit subject.
            if not subj_code and not subj_name:
                return None
            qs = CurriculumDepartment.objects.all()
            from django.db import models as dj_models
            qs = qs.filter(dj_models.Q(course_code__iexact=subj_code) | dj_models.Q(course_name__iexact=subj_name))
            if dept is not None:
                qs = qs.filter(department=dept)
            return qs.first()
        except Exception:
            return None

    def get_subject_code(self, obj):
        # prefer curriculum_row first, then explicit Subject
        try:
            if getattr(obj, 'curriculum_row', None):
                row = obj.curriculum_row
                # department row may omit code/name; fall back to master entry if present
                code = getattr(row, 'course_code', None) or (getattr(getattr(row, 'master', None), 'course_code', None) if getattr(row, 'master', None) else None)
                if code:
                    return code
            if getattr(obj, 'subject', None):
                return getattr(obj.subject, 'code', None)
            # As a last resort, try to match a curriculum row explicitly
            row = self._curriculum_row_for_obj(obj)
            if row:
                return getattr(row, 'course_code', None)
        except Exception:
            pass
        return None

    def get_subject_name(self, obj):
        try:
            if getattr(obj, 'curriculum_row', None):
                row = obj.curriculum_row
                # prefer department row name, else use master.name
                name = getattr(row, 'course_name', None) or (getattr(getattr(row, 'master', None), 'course_name', None) if getattr(row, 'master', None) else None)
                if name:
                    return name
            if getattr(obj, 'subject', None):
                return getattr(obj.subject, 'name', None)
            row = self._curriculum_row_for_obj(obj)
            if row:
                return getattr(row, 'course_name', None)
        except Exception:
            pass
        return None

    def get_batch(self, obj):
        try:
            return getattr(getattr(obj.section, 'batch', None), 'name', None)
        except Exception:
            return None

    def get_semester(self, obj):
        try:
            sem = getattr(obj.section, 'semester', None)
            if sem is None:
                return None
            # return numeric semester value for simpler consumption
            return getattr(sem, 'number', str(sem))
        except Exception:
            return None

    def get_curriculum_row_id(self, obj):
        try:
            row = getattr(obj, 'curriculum_row', None)
            return getattr(row, 'id', None)
        except Exception:
            return None


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    # Accept curriculum_department row id to link directly
    curriculum_row_id = serializers.IntegerField(write_only=True, required=False)
    staff_id = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all(), source='staff', write_only=True)
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section', write_only=True)
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False)
    subject = serializers.SerializerMethodField(read_only=True)
    # Readable fields for API consumers
    staff_details = serializers.SerializerMethodField(read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = ('id', 'staff_id', 'section_id', 'academic_year', 'subject', 'curriculum_row_id', 'is_active', 'staff_details', 'section_name')

    def get_subject(self, obj):
        # prefer curriculum_row display, then explicit Subject
        try:
            if getattr(obj, 'curriculum_row', None):
                row = obj.curriculum_row
                code = getattr(row, 'course_code', None) or (getattr(getattr(row, 'master', None), 'course_code', None) if getattr(row, 'master', None) else None)
                name = getattr(row, 'course_name', None) or (getattr(getattr(row, 'master', None), 'course_name', None) if getattr(row, 'master', None) else None)
                return f"{code or ''}{(' - ' + name) if name else ''}".strip(' -')
            if getattr(obj, 'subject', None):
                return getattr(obj.subject, 'name', str(obj.subject))
            # If neither present, return None
        except Exception:
            pass
        return None

    def get_staff_details(self, obj):
        try:
            st = getattr(obj, 'staff', None)
            if not st:
                return None
            return {'id': st.id, 'user': getattr(getattr(st, 'user', None), 'username', None), 'staff_id': getattr(st, 'staff_id', None)}
        except Exception:
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
    # role-based ADVISOR check only (HODs no longer have implicit access)
    role_names = {r.name.upper() for r in user.roles.all()}
    if 'ADVISOR' in role_names:
        try:
            from .models import SectionAdvisor
            # active advisor mapping for the assignment's section and academic year
            sec = getattr(teaching_assignment, 'section', None)
            ay = getattr(teaching_assignment, 'academic_year', None)
            if sec and ay and staff_profile:
                return SectionAdvisor.objects.filter(section=sec, advisor=staff_profile, academic_year=ay, is_active=True).exists()
        except Exception:
            pass
    return False


class SectionAdvisorSerializer(serializers.ModelSerializer):
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section', write_only=True)
    advisor_id = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all(), source='advisor', write_only=True)
    section = serializers.StringRelatedField(read_only=True)
    advisor = serializers.StringRelatedField(read_only=True)
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False, allow_null=True)
    department_id = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SectionAdvisor
        fields = ('id', 'section', 'section_id', 'advisor', 'advisor_id', 'academic_year', 'is_active', 'department_id')

    def get_department_id(self, obj):
        try:
            return obj.section.batch.course.department_id
        except Exception:
            return None

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
        sec_dept = None
        try:
            sec_dept = section.batch.course.department if section and section.batch and section.batch.course else None
        except Exception:
            sec_dept = None
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


# DayAttendance serializers removed (attendance API being removed).


class StudentSubjectBatchSerializer(serializers.ModelSerializer):
    staff = serializers.SerializerMethodField(read_only=True)
    student_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    students = StudentSimpleSerializer(many=True, read_only=True)
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False)
    curriculum_row_id = serializers.IntegerField(write_only=True, required=False)
    curriculum_row = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = None  # set at import time to avoid circular import
        fields = ('id', 'name', 'staff', 'academic_year', 'curriculum_row_id', 'curriculum_row', 'student_ids', 'students', 'is_active', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at')

    def __init__(self, *args, **kwargs):
        # import model lazily
        from .models import StudentSubjectBatch
        self.Meta.model = StudentSubjectBatch
        super().__init__(*args, **kwargs)

    def get_staff(self, obj):
        try:
            st = getattr(obj, 'staff', None)
            if not st:
                return None
            return {'id': st.id, 'user': getattr(getattr(st, 'user', None), 'username', None), 'staff_id': getattr(st, 'staff_id', None)}
        except Exception:
            return None

    def get_curriculum_row(self, obj):
        try:
            row = getattr(obj, 'curriculum_row', None)
            if not row:
                return None
            return {'id': row.id, 'course_code': getattr(row, 'course_code', None), 'course_name': getattr(row, 'course_name', None)}
        except Exception:
            return None

    def create(self, validated_data):
        student_ids = validated_data.pop('student_ids', []) or []
        curriculum_row_id = validated_data.pop('curriculum_row_id', None) or self.initial_data.get('curriculum_row_id')
        # default academic year
        if 'academic_year' not in validated_data or not validated_data.get('academic_year'):
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()
            if ay:
                validated_data['academic_year'] = ay

        # staff will be set in view to current user's staff_profile when creating
        # attach curriculum_row if provided
        if curriculum_row_id:
            try:
                from curriculum.models import CurriculumDepartment
                row = CurriculumDepartment.objects.filter(pk=int(curriculum_row_id)).first()
                if row:
                    validated_data['curriculum_row'] = row
            except Exception:
                pass

        batch = super().create(validated_data)
        if student_ids:
            sts = StudentProfile.objects.filter(pk__in=student_ids)
            batch.students.set(sts)
        return batch

    def update(self, instance, validated_data):
        student_ids = validated_data.pop('student_ids', None)
        curriculum_row_id = validated_data.pop('curriculum_row_id', None) or self.initial_data.get('curriculum_row_id')
        if curriculum_row_id is not None:
            try:
                from curriculum.models import CurriculumDepartment
                row = CurriculumDepartment.objects.filter(pk=int(curriculum_row_id)).first()
                validated_data['curriculum_row'] = row
            except Exception:
                pass
        inst = super().update(instance, validated_data)
        if student_ids is not None:
            sts = StudentProfile.objects.filter(pk__in=student_ids)
            inst.students.set(sts)
        return inst


class PeriodAttendanceRecordSerializer(serializers.ModelSerializer):
    from .models import PeriodAttendanceSession as _PeriodAttendanceSession

    # session is optional for nested/bulk payloads; the view will supply the session
    session = serializers.PrimaryKeyRelatedField(queryset=_PeriodAttendanceSession.objects.all(), required=False, write_only=True)
    student_id = serializers.PrimaryKeyRelatedField(queryset=StudentProfile.objects.all(), source='student', write_only=True)
    student = serializers.StringRelatedField(read_only=True)
    student_pk = serializers.IntegerField(source='student.id', read_only=True)

    class Meta:
        model = PeriodAttendanceRecord
        fields = ('id', 'session', 'student', 'student_pk', 'student_id', 'status', 'marked_at', 'marked_by')
        read_only_fields = ('marked_at', 'marked_by')


class BulkRecordSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    status = serializers.CharField()

    def validate_status(self, value):
        try:
            from .models import PERIOD_ATTENDANCE_STATUS_CHOICES
            allowed = {s[0] for s in PERIOD_ATTENDANCE_STATUS_CHOICES}
        except Exception:
            allowed = {'P', 'A', 'OD', 'LATE', 'LEAVE'}
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid status '{value}'. Allowed: {', '.join(sorted(allowed))}")
        return value


class BulkPeriodAttendanceSerializer(serializers.Serializer):
    section_id = serializers.IntegerField(write_only=True)
    period_id = serializers.IntegerField(write_only=True)
    date = serializers.DateField()
    records = BulkRecordSerializer(many=True)

    def validate(self, attrs):
        # Basic validation ensuring records correspond to students in the section
        return attrs


class PeriodAttendanceSessionSerializer(serializers.ModelSerializer):
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section', write_only=True)
    period_id = serializers.PrimaryKeyRelatedField(queryset=TimetableSlot.objects.all(), source='period', write_only=True)
    section = serializers.StringRelatedField(read_only=True)
    period = serializers.SerializerMethodField(read_only=True)
    records = PeriodAttendanceRecordSerializer(many=True, read_only=True)

    class Meta:
        model = PeriodAttendanceSession
        fields = ('id', 'section', 'section_id', 'period', 'period_id', 'date', 'timetable_assignment', 'created_by', 'is_locked', 'created_at', 'records')
        read_only_fields = ('created_by', 'created_at')

    # no custom __init__ required; queryset for `period_id` is statically provided above

    def get_period(self, obj):
        try:
            p = obj.period
            return {'id': p.id, 'index': p.index, 'label': p.label, 'start_time': p.start_time, 'end_time': p.end_time}
        except Exception:
            return None


 
