from rest_framework import serializers
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import TeachingAssignment
from .models import SpecialCourseAssessmentEditRequest, DailyAttendanceUnlockRequest
from academics.models import Subject, Section
from accounts.utils import get_user_permissions
from academics.models import SectionAdvisor, StaffProfile
from academics.models import AcademicYear
from django.core.exceptions import ValidationError
from rest_framework.validators import UniqueTogetherValidator
from academics.models import StudentProfile
from academics.models import PeriodAttendanceSession, PeriodAttendanceRecord
from timetable.models import TimetableSlot
from academics.models import AttendanceUnlockRequest


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ('id', 'name', 'is_active', 'parity')


class TeachingAssignmentInfoSerializer(serializers.ModelSerializer):
    subject_code = serializers.SerializerMethodField(read_only=True)
    subject_name = serializers.SerializerMethodField(read_only=True)
    class_type = serializers.SerializerMethodField(read_only=True)
    section_name = serializers.SerializerMethodField(read_only=True)
    section_id = serializers.IntegerField(source='section.id', read_only=True)
    elective_subject_id = serializers.SerializerMethodField(read_only=True)
    elective_subject_name = serializers.SerializerMethodField(read_only=True)
    curriculum_row_id = serializers.SerializerMethodField(read_only=True)
    batch = serializers.SerializerMethodField(read_only=True)
    semester = serializers.SerializerMethodField(read_only=True)
    academic_year = serializers.SerializerMethodField(read_only=True)
    department = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = (
            'id',
            'subject_code',
            'subject_name',
            'class_type',
            'section_name',
            'section_id',
            'elective_subject_id',
            'elective_subject_name',
            'curriculum_row_id',
            'batch',
            'semester',
            'academic_year',
            'department',
        )

    def get_academic_year(self, obj):
        try:
            return getattr(getattr(obj, 'academic_year', None), 'name', None)
        except Exception:
            return None

    def get_section_name(self, obj):
        try:
            sec = getattr(obj, 'section', None)
            if sec is not None:
                return getattr(sec, 'name', None)
        except Exception:
            pass

        # Fallback for elective assignments: derive a representative section
        try:
            if getattr(obj, 'elective_subject', None):
                from curriculum.models import ElectiveChoice
                qs = ElectiveChoice.objects.filter(is_active=True, elective_subject_id=getattr(obj, 'elective_subject_id', None)).select_related('student__section')
                # Try with academic year first, fall back to without
                if getattr(obj, 'academic_year_id', None):
                    qs_ay = qs.filter(academic_year_id=getattr(obj, 'academic_year_id', None))
                    if qs_ay.exists():
                        qs = qs_ay
                first = qs.first()
                if first and getattr(getattr(first, 'student', None), 'section', None):
                    return str(getattr(first.student.section, 'name', None))
        except Exception:
            pass

        # Fallback: try to infer from curriculum_row -> department's first section (best-effort)
        try:
            row = getattr(obj, 'curriculum_row', None)
            if row is not None:
                # find a section for the same department and academic year
                from academics.models import Section
                sec_qs = Section.objects.filter(batch__course__department_id=getattr(getattr(row, 'department', None), 'id', None)).order_by('name')
                sec = sec_qs.first()
                if sec:
                    return getattr(sec, 'name', None)
        except Exception:
            pass

        # Final fallback: use department short_name or name if available
        try:
            dept = self.get_department(obj)
            if dept:
                return dept.get('short_name') or dept.get('name')
        except Exception:
            pass

        return None

    def get_department(self, obj):
        try:
            dept = None

            # Prefer section -> batch -> course -> department (most assignments)
            try:
                dept = obj.section.batch.course.department
            except Exception:
                dept = None

            # Department-wide / elective teaching assignments may not have a section.
            if not dept:
                try:
                    dept = getattr(getattr(obj, 'elective_subject', None), 'department', None)
                except Exception:
                    dept = None

            # Fallback: curriculum row's department (department-wide curricula)
            if not dept:
                try:
                    dept = getattr(getattr(obj, 'curriculum_row', None), 'department', None)
                except Exception:
                    dept = None

            if not dept:
                return None
            return {
                'id': dept.id,
                'code': getattr(dept, 'code', None),
                'name': getattr(dept, 'name', None),
                'short_name': getattr(dept, 'short_name', None),
            }
        except Exception:
            return None

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
            # If this is an elective assignment without curriculum_row/subject, prefer elective_subject
            if getattr(obj, 'elective_subject', None):
                es = obj.elective_subject
                return getattr(es, 'course_code', None)
            # As a last resort, try to match a curriculum row explicitly
            row = self._curriculum_row_for_obj(obj)
            if row:
                return getattr(row, 'course_code', None)
        except Exception:
            pass
        return None

    def get_subject_name(self, obj):
        try:
            # If assignment uses a custom_subject code, prefer its display label
            try:
                cs = getattr(obj, 'custom_subject', None)
                if cs:
                    fld = obj._meta.get_field('custom_subject')
                    choices_map = dict(getattr(fld, 'choices', []))
                    return choices_map.get(cs, cs)
            except Exception:
                pass
            if getattr(obj, 'curriculum_row', None):
                row = obj.curriculum_row
                # prefer department row name, else use master.name
                name = getattr(row, 'course_name', None) or (getattr(getattr(row, 'master', None), 'course_name', None) if getattr(row, 'master', None) else None)
                if name:
                    return name
            if getattr(obj, 'subject', None):
                return getattr(obj.subject, 'name', None)
            if getattr(obj, 'elective_subject', None):
                es = obj.elective_subject
                return getattr(es, 'course_name', None)
            row = self._curriculum_row_for_obj(obj)
            if row:
                return getattr(row, 'course_name', None)
        except Exception:
            pass
        return None

    def get_class_type(self, obj):
        """Return class_type based on the assignment's section department curriculum row.

        This is intentionally computed server-side so cross-department staff
        (assigned to another department's section) still get the correct class_type
        without needing direct access to curriculum department endpoints.
        """
        try:
            # Elective assignments store class_type on ElectiveSubject
            if getattr(obj, 'elective_subject', None):
                ct = getattr(obj.elective_subject, 'class_type', None)
                if ct:
                    return ct

            row = getattr(obj, 'curriculum_row', None) or self._curriculum_row_for_obj(obj)
            if row:
                ct = getattr(row, 'class_type', None) or getattr(getattr(row, 'master', None), 'class_type', None)
                if ct:
                    return ct
        except Exception:
            return None

        return None

    def get_batch(self, obj):
        try:
            return getattr(getattr(obj.section, 'batch', None), 'name', None)
        except Exception:
            return None

    def get_semester(self, obj):
        try:
            sem = getattr(getattr(obj, 'section', None), 'semester', None)
            if sem:
                return getattr(sem, 'number', str(sem))
        except Exception:
            pass
        # Fallback: curriculum_row.semester or elective_subject.semester
        try:
            sem = getattr(getattr(obj, 'curriculum_row', None), 'semester', None)
            if sem:
                return getattr(sem, 'number', str(sem))
        except Exception:
            pass
        try:
            sem = getattr(getattr(obj, 'elective_subject', None), 'semester', None)
            if sem:
                return getattr(sem, 'number', str(sem))
        except Exception:
            pass
        return None

    def get_curriculum_row_id(self, obj):
        try:
            row = getattr(obj, 'curriculum_row', None)
            return getattr(row, 'id', None)
        except Exception:
            return None

    def get_elective_subject_id(self, obj):
        try:
            es = getattr(obj, 'elective_subject', None)
            return getattr(es, 'id', None)
        except Exception:
            return None

    def get_elective_subject_name(self, obj):
        try:
            es = getattr(obj, 'elective_subject', None)
            if not es:
                return None
            return f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
        except Exception:
            return None


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    # Accept curriculum_department row id to link directly
    curriculum_row_id = serializers.IntegerField(write_only=True, required=False)
    elective_subject_id = serializers.IntegerField(write_only=True, required=False)
    staff_id = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all(), source='staff', write_only=True)
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section', write_only=True, required=False, allow_null=True)
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False)
    subject = serializers.SerializerMethodField(read_only=True)
    # Readable fields for API consumers
    staff_details = serializers.SerializerMethodField(read_only=True)
    section_details = serializers.SerializerMethodField(read_only=True)
    curriculum_row_details = serializers.SerializerMethodField(read_only=True)
    elective_subject_details = serializers.SerializerMethodField(read_only=True)
    elective_subject_id = serializers.SerializerMethodField(read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    custom_subject = serializers.CharField(allow_null=True, required=False)

    class Meta:
        model = TeachingAssignment

        fields = ('id', 'staff_id', 'section_id', 'academic_year', 'subject', 'curriculum_row_id', 'elective_subject_id', 'custom_subject', 'is_active', 'staff_details', 'section_details', 'curriculum_row_details', 'section_name', 'enabled_assessments', 'elective_subject_details')
        enabled_assessments = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)

    def get_subject(self, obj):
        # prefer curriculum_row display, then explicit Subject
        try:
            # Prefer elective subject first
            if getattr(obj, 'elective_subject', None):
                es = obj.elective_subject
                return f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
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

    def get_elective_subject_id(self, obj):
        try:
            es = getattr(obj, 'elective_subject', None)
            return getattr(es, 'id', None)
        except Exception:
            return None

    def get_staff_details(self, obj):
        try:
            st = getattr(obj, 'staff', None)
            if not st:
                return None
            return {'id': st.id, 'user': getattr(getattr(st, 'user', None), 'username', None), 'staff_id': getattr(st, 'staff_id', None)}
        except Exception:
            return None

    def get_section_details(self, obj):
        try:
            section = getattr(obj, 'section', None)
            if not section:
                return None
            
            batch = getattr(section, 'batch', None)
            batch_info = None
            if batch:
                batch_info = getattr(batch, 'name', str(batch))

            semester = getattr(section, 'semester', None)
            semester_info = None
            if semester:
                semester_info = getattr(semester, 'number', getattr(semester, 'name', str(semester)))

            dept = None
            try:
                dept = section.batch.course.department
            except Exception:
                dept = None
            dept_info = None
            if dept:
                dept_info = {
                    'id': dept.id,
                    'code': getattr(dept, 'code', None),
                    'name': getattr(dept, 'name', None),
                    'short_name': getattr(dept, 'short_name', None),
                }
                
            return {
                'id': section.id, 
                'name': getattr(section, 'name', None), 
                'batch': batch_info,
                'semester': semester_info,
                'department': dept_info,
            }
        except Exception:
            return None

    def get_curriculum_row_details(self, obj):
        try:
            row = getattr(obj, 'curriculum_row', None)
            if not row:
                return None
                
            semester = getattr(row, 'semester', None)
            semester_info = None
            if semester:
                semester_info = getattr(semester, 'number', getattr(semester, 'name', str(semester)))
                
            return {
                'id': row.id,
                'course_code': getattr(row, 'course_code', None),
                'course_name': getattr(row, 'course_name', None),
                'semester': semester_info
            }
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
        # If client provided an elective_subject_id, enforce HOD or explicit permission
        try:
            elect_id = self.initial_data.get('elective_subject_id')
            if elect_id:
                from curriculum.models import ElectiveSubject
                es = ElectiveSubject.objects.filter(pk=int(elect_id)).select_related('parent__department').first()
                if es:
                    # check if user has direct permission
                    perms = []
                    try:
                        perms = get_user_permissions(user)
                    except Exception:
                        perms = []
                    if ('academics.assign_elective_teaching' in perms) or user.has_perm('academics.assign_elective_teaching'):
                        return attrs
                    # check HOD membership for the elective's parent department
                    from .models import DepartmentRole
                    staff_profile = getattr(user, 'staff_profile', None)
                    if staff_profile:
                        hod_depts = list(DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True))
                        parent_dept_id = getattr(getattr(es, 'parent', None), 'department_id', None)
                        elect_dept_id = getattr(es, 'department_id', None)
                        if (parent_dept_id and parent_dept_id in hod_depts) or (elect_dept_id and elect_dept_id in hod_depts):
                            return attrs
                    raise ValidationError('You do not have permission to assign this elective subject')
        except ValidationError:
            raise
        except Exception:
            # If elective lookup fails, let view-level permission checks handle it
            pass

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

        # If elective_subject_id provided, attach that instead
        elective_id = self.initial_data.get('elective_subject_id')
        if elective_id:
            try:
                from curriculum.models import ElectiveSubject
                es = ElectiveSubject.objects.filter(pk=int(elective_id)).first()
                if es:
                    validated_data['elective_subject'] = es
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

        # If there's an existing active curriculum_row mapping for the same
        # section + academic_year, update it to point to the new staff.
        if row and section and ay and staff:
            try:
                with transaction.atomic():
                    existing = TeachingAssignment.objects.filter(curriculum_row=row, section=section, academic_year=ay, is_active=True).first()
                    if existing:
                        existing.staff = staff
                        if 'is_active' in validated_data:
                            existing.is_active = validated_data.get('is_active')
                        existing.save()
                        return existing
                    # Also handle elective mappings that are section-scoped
                    es_row = validated_data.get('elective_subject')
                    if es_row:
                        existing = TeachingAssignment.objects.filter(elective_subject=es_row, section=section, academic_year=ay, is_active=True).first()
                        if existing:
                            existing.staff = staff
                            if 'is_active' in validated_data:
                                existing.is_active = validated_data.get('is_active')
                            existing.save()
                            return existing
            except Exception:
                # fall back to normal create on error
                pass

        # If elective provided without section, try to find an existing elective mapping
        # for the same elective + academic_year and update staff instead of creating
        # a duplicate.
        es_row = validated_data.get('elective_subject')
        if es_row and ay and staff:
            try:
                with transaction.atomic():
                    existing = TeachingAssignment.objects.filter(elective_subject=es_row, academic_year=ay, is_active=True).first()
                    if existing:
                        existing.staff = staff
                        if 'is_active' in validated_data:
                            existing.is_active = validated_data.get('is_active')
                        existing.save()
                        return existing
            except Exception:
                pass

        return super().create(validated_data)

    def get_elective_subject_details(self, obj):
        try:
            es = getattr(obj, 'elective_subject', None)
            if not es:
                return None
            dept = getattr(es, 'department', None)
            parent = getattr(es, 'parent', None)
            return {
                'id': getattr(es, 'id', None),
                'course_code': getattr(es, 'course_code', None),
                'course_name': getattr(es, 'course_name', None),
                'department_id': getattr(dept, 'id', None),
                'department_display': str(dept) if dept else None,
                'parent_id': getattr(parent, 'id', None),
            }
        except Exception:
            return None



class SpecialCourseAssessmentEditRequestSerializer(serializers.ModelSerializer):
    selection_id = serializers.IntegerField(source='selection.id', read_only=True)
    curriculum_row_id = serializers.IntegerField(source='selection.curriculum_row_id', read_only=True)
    academic_year_id = serializers.IntegerField(source='selection.academic_year_id', read_only=True)
    requested_by_id = serializers.IntegerField(source='requested_by.id', read_only=True)
    requested_by_user = serializers.SerializerMethodField(read_only=True)
    reviewed_by_username = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SpecialCourseAssessmentEditRequest
        fields = (
            'id',
            'selection_id',
            'curriculum_row_id',
            'academic_year_id',
            'requested_by_id',
            'requested_by_user',
            'status',
            'requested_at',
            'reviewed_by_username',
            'reviewed_at',
            'can_edit_until',
            'used_at',
        )

    def get_requested_by_user(self, obj):
        try:
            u = getattr(getattr(obj, 'requested_by', None), 'user', None)
            return getattr(u, 'username', None)
        except Exception:
            return None

    def get_reviewed_by_username(self, obj):
        try:
            u = getattr(obj, 'reviewed_by', None)
            return getattr(u, 'username', None)
        except Exception:
            return None




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
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section')
    advisor_id = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all(), source='advisor')
    section = serializers.StringRelatedField(read_only=True)
    advisor = serializers.StringRelatedField(read_only=True)
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False, allow_null=True)
    department_id = serializers.SerializerMethodField(read_only=True)

    def get_department_id(self, obj):
        try:
            return obj.section.batch.course.department_id
        except Exception:
            return None

    class Meta:
        model = SectionAdvisor
        fields = ('id', 'section', 'section_id', 'advisor', 'advisor_id', 'academic_year', 'is_active', 'department_id')


class AttendanceUnlockRequestSerializer(serializers.ModelSerializer):
    session_id = serializers.IntegerField(source='session.id', read_only=True)
    session_display = serializers.SerializerMethodField(read_only=True)
    requested_by = serializers.SerializerMethodField(read_only=True)
    requested_by_display = serializers.SerializerMethodField(read_only=True)
    reviewed_by_display = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AttendanceUnlockRequest
        fields = ('id', 'session', 'session_id', 'session_display', 'requested_by', 'requested_by_display', 'requested_at', 'status', 'reviewed_by', 'reviewed_by_display', 'reviewed_at', 'note')
        read_only_fields = ('requested_at',)

    def get_session_display(self, obj):
        try:
            sess = obj.session
            return f"{getattr(sess, 'section', '')} | {getattr(sess, 'period', '')} @ {getattr(sess, 'date', '')}"
        except Exception:
            return None

    def get_requested_by(self, obj):
        try:
            sb = obj.requested_by
            return {'id': getattr(sb, 'id', None), 'staff_id': getattr(sb, 'staff_id', None), 'username': getattr(getattr(sb, 'user', None), 'username', None)}
        except Exception:
            return None

    def get_requested_by_display(self, obj):
        try:
            sb = obj.requested_by
            return getattr(getattr(sb, 'user', None), 'username', None) or getattr(sb, 'staff_id', None) or str(getattr(sb, 'id', ''))
        except Exception:
            return None

    def get_reviewed_by_display(self, obj):
        try:
            rb = obj.reviewed_by
            return getattr(getattr(rb, 'user', None), 'username', None) or getattr(rb, 'staff_id', None) or str(getattr(rb, 'id', ''))
        except Exception:
            return None


class DailyAttendanceUnlockRequestSerializer(serializers.ModelSerializer):
    session_id = serializers.IntegerField(source='session.id', read_only=True)
    session_display = serializers.SerializerMethodField(read_only=True)
    requested_by = serializers.SerializerMethodField(read_only=True)
    requested_by_display = serializers.SerializerMethodField(read_only=True)
    reviewed_by_display = serializers.SerializerMethodField(read_only=True)
    request_type = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = DailyAttendanceUnlockRequest
        fields = ('id', 'session', 'session_id', 'session_display', 'requested_by', 'requested_by_display', 'requested_at', 'status', 'reviewed_by', 'reviewed_by_display', 'reviewed_at', 'note', 'request_type')
        read_only_fields = ('requested_at',)

    def get_request_type(self, obj):
        return 'daily'

    def get_session_display(self, obj):
        try:
            sess = obj.session
            return f"{getattr(sess.section, 'name', '')} | Daily Attendance @ {getattr(sess, 'date', '')}"
        except Exception:
            return None

    def get_requested_by(self, obj):
        try:
            sb = obj.requested_by
            return {'id': getattr(sb, 'id', None), 'staff_id': getattr(sb, 'staff_id', None), 'username': getattr(getattr(sb, 'user', None), 'username', None)}
        except Exception:
            return None

    def get_requested_by_display(self, obj):
        try:
            sb = obj.requested_by
            return getattr(getattr(sb, 'user', None), 'username', None) or getattr(sb, 'staff_id', None) or str(getattr(sb, 'id', ''))
        except Exception:
            return None

    def get_reviewed_by_display(self, obj):
        try:
            rb = obj.reviewed_by
            if rb:
                return getattr(getattr(rb, 'user', None), 'username', None) or getattr(rb, 'staff_id', None) or str(getattr(rb, 'id', ''))
        except Exception:
            pass
        return None

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
    has_mentor = serializers.BooleanField(default=False)
    mentor_id = serializers.IntegerField(allow_null=True, required=False)
    mentor_name = serializers.CharField(allow_null=True, required=False)


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
    student = serializers.SerializerMethodField(read_only=True)
    student_pk = serializers.IntegerField(source='student.id', read_only=True)
    reg_no = serializers.CharField(source='student.reg_no', read_only=True)
    regno = serializers.CharField(source='student.reg_no', read_only=True)

    class Meta:
        model = PeriodAttendanceRecord
        fields = ('id', 'session', 'student', 'student_pk', 'student_id', 'status', 'marked_at', 'marked_by', 'reg_no', 'regno')
        read_only_fields = ('marked_at', 'marked_by')

    def get_student(self, obj):
        """Return detailed student information including registration number."""
        if not obj.student:
            return None
        return {
            'id': obj.student.id,
            'pk': obj.student.id,
            'reg_no': obj.student.reg_no,
            'regno': obj.student.reg_no,
            'registration_number': obj.student.reg_no,
            'name': obj.student.user.get_full_name() if obj.student.user else '',
            'username': obj.student.user.username if obj.student.user else '',
        }


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
    teaching_assignment_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    date = serializers.DateField()
    records = BulkRecordSerializer(many=True)

    def validate(self, attrs):
        # Basic validation ensuring records correspond to students in the section
        return attrs


class PeriodAttendanceSessionSerializer(serializers.ModelSerializer):
    section_id = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), source='section', write_only=True)
    period_id = serializers.PrimaryKeyRelatedField(queryset=TimetableSlot.objects.all(), source='period', write_only=True)
    teaching_assignment_id = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.all(), source='teaching_assignment', write_only=True, required=False, allow_null=True)
    section = serializers.SerializerMethodField(read_only=True)
    period = serializers.SerializerMethodField(read_only=True)
    records = PeriodAttendanceRecordSerializer(many=True, read_only=True)

    class Meta:
        model = PeriodAttendanceSession
        fields = ('id', 'section', 'section_id', 'period', 'period_id', 'date', 'timetable_assignment', 'teaching_assignment', 'teaching_assignment_id', 'created_by', 'is_locked', 'created_at', 'records')
        read_only_fields = ('created_by', 'created_at')

    # no custom __init__ required; queryset for `period_id` is statically provided above

    def get_section(self, obj):
        try:
            s = obj.section
            return {'id': s.id, 'name': str(s)}
        except Exception:
            return None

    def get_period(self, obj):
        try:
            p = obj.period
            return {'id': p.id, 'index': p.index, 'label': p.label, 'start_time': p.start_time, 'end_time': p.end_time}
        except Exception:
            return None


class StaffProfileSerializer(serializers.ModelSerializer):
    """Serializer for creating and updating staff profiles."""
    # User fields for creation
    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False)
    first_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    
    # Read-only user info
    user_username = serializers.CharField(source='user.username', read_only=True)
    user_first_name = serializers.CharField(source='user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='user.last_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    
    # Roles
    roles = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    user_roles = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = StaffProfile
        fields = [
            'id', 'staff_id', 'department', 'designation', 'status',
            'mobile_number', 'mobile_number_verified_at',
            # Write-only user fields
            'username', 'password', 'first_name', 'last_name', 'email',
            # Read-only user fields
            'user_username', 'user_first_name', 'user_last_name', 'user_email',
            # Roles
            'roles', 'user_roles',
        ]
        read_only_fields = ['id', 'mobile_number_verified_at']
    
    def get_user_roles(self, obj):
        """Get user roles."""
        try:
            return [r.name for r in obj.user.roles.all()]
        except Exception:
            return []
    
    def create(self, validated_data):
        """Create a staff profile with a new user."""
        from django.contrib.auth import get_user_model
        from accounts.models import Role
        
        User = get_user_model()
        
        # Extract user-related fields
        username = validated_data.pop('username', None)
        password = validated_data.pop('password', None)
        first_name = validated_data.pop('first_name', '')
        last_name = validated_data.pop('last_name', '')
        email = validated_data.pop('email', '')
        roles = validated_data.pop('roles', [])
        
        if not username:
            raise serializers.ValidationError({'username': 'Username is required for new staff.'})
        
        # Create user
        try:
            user = User.objects.create_user(
                username=username,
                password=password or 'changeme123',
                first_name=first_name,
                last_name=last_name,
                email=email
            )
        except IntegrityError:
            raise serializers.ValidationError({'username': 'Username already exists.'})
        
        # Create staff profile
        validated_data['user'] = user
        staff_profile = StaffProfile.objects.create(**validated_data)
        
        # Assign roles
        if roles:
            role_objects = Role.objects.filter(name__in=roles)
            user.roles.set(role_objects)
            
            # Handle DepartmentRole synchronization for HOD/AHOD roles in new staff
            self._sync_department_roles(staff_profile, set(), set(roles))
        
        return staff_profile
    
    def update(self, instance, validated_data):
        """Update staff profile and optionally user details."""
        from accounts.models import Role
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        
        # Extract user-related fields
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)
        email = validated_data.pop('email', None)
        password = validated_data.pop('password', None)
        username = validated_data.pop('username', None)  # Allow username updates
        roles = validated_data.pop('roles', None)
        
        # Validate staff_id uniqueness if being changed
        new_staff_id = validated_data.get('staff_id')
        if new_staff_id and new_staff_id != instance.staff_id:
            from academics.models import StaffProfile
            if StaffProfile.objects.filter(staff_id=new_staff_id).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError({'staff_id': 'This staff ID is already in use.'})
        
        # Update user fields if provided
        user = instance.user
        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
        if email is not None:
            user.email = email
        if username is not None:
            # Check if new username already exists for a different user
            if User.objects.filter(username=username).exclude(pk=user.pk).exists():
                raise serializers.ValidationError({'username': 'A user with this username already exists.'})
            user.username = username
        if password:
            user.set_password(password)
        user.save()
        
        # Update roles if provided
        if roles is not None:
            role_objects = Role.objects.filter(name__in=roles)
            
            # Get current roles before update for comparison
            old_role_names = set(user.roles.values_list('name', flat=True))
            new_role_names = set(roles)
            
            # Update user roles
            user.roles.set(role_objects)
            
            # Handle DepartmentRole synchronization for HOD/AHOD roles
            self._sync_department_roles(instance, old_role_names, new_role_names)
        
        # Update staff profile fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        return instance
    
    def _sync_department_roles(self, staff_instance, old_roles, new_roles):
        """
        Synchronize DepartmentRole table when HOD/AHOD roles are assigned or removed.
        """
        from academics.models import DepartmentRole, AcademicYear
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Define which roles should create department roles
        dept_role_mapping = {
            'HOD': DepartmentRole.DeptRole.HOD,
            'AHOD': DepartmentRole.DeptRole.AHOD,
            'Head of Department': DepartmentRole.DeptRole.HOD,
            'Assistant HOD': DepartmentRole.DeptRole.AHOD,
        }
        
        # Get active academic year
        active_academic_year = AcademicYear.objects.filter(is_active=True).first()
        if not active_academic_year:
            active_academic_year = AcademicYear.objects.order_by('-id').first()
        
        if not active_academic_year:
            logger.warning(f"No academic year found for department role sync - Staff: {staff_instance.staff_id}")
            return
        
        # Get staff's department (prefer current assignment, fallback to profile department)
        staff_department = staff_instance.get_current_department()
        if not staff_department:
            logger.warning(f"No department assigned for staff {staff_instance.staff_id} - skipping department role sync")
            return
        
        logger.info(f"Syncing department roles for staff {staff_instance.staff_id} in department {staff_department.code}")
        
        # Handle newly added HOD/AHOD roles
        added_roles = new_roles - old_roles
        for role_name in added_roles:
            if role_name in dept_role_mapping:
                dept_role_type = dept_role_mapping[role_name]
                
                # Check if there's already an active role of this type for this staff in this department
                existing_role = DepartmentRole.objects.filter(
                    staff=staff_instance,
                    department=staff_department,
                    role=dept_role_type,
                    academic_year=active_academic_year,
                    is_active=True
                ).first()
                
                if not existing_role:
                    # If HOD role, deactivate any existing HOD for this department (only one HOD per dept)
                    if dept_role_type == DepartmentRole.DeptRole.HOD:
                        old_hods = DepartmentRole.objects.filter(
                            department=staff_department,
                            role=DepartmentRole.DeptRole.HOD,
                            academic_year=active_academic_year,
                            is_active=True
                        )
                        if old_hods.exists():
                            logger.info(f"Deactivating previous HOD(s) for department {staff_department.code}")
                            old_hods.update(is_active=False)
                    
                    # Create new department role
                    new_dept_role = DepartmentRole.objects.create(
                        staff=staff_instance,
                        department=staff_department,
                        role=dept_role_type,
                        academic_year=active_academic_year,
                        is_active=True
                    )
                    logger.info(f"Created department role: {new_dept_role}")
                else:
                    logger.info(f"Department role {dept_role_type} already exists for staff {staff_instance.staff_id} in {staff_department.code}")
        
        # Handle removed HOD/AHOD roles
        removed_roles = old_roles - new_roles
        for role_name in removed_roles:
            if role_name in dept_role_mapping:
                dept_role_type = dept_role_mapping[role_name]
                
                # Deactivate existing department roles of this type for this staff
                deactivated_roles = DepartmentRole.objects.filter(
                    staff=staff_instance,
                    department=staff_department,
                    role=dept_role_type,
                    academic_year=active_academic_year,
                    is_active=True
                )
                
                if deactivated_roles.exists():
                    logger.info(f"Deactivating department role {dept_role_type} for staff {staff_instance.staff_id} in {staff_department.code}")
                    deactivated_roles.update(is_active=False)
 
