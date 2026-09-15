from rest_framework import serializers
from django.db.models import Q
from .models import (
    DisciplineApprovalFlowConfig,
    DisciplineCategory,
    DisciplineIncidentLog,
    DisciplineIncidentAction,
)
from academics.models import StudentProfile


class DisciplineApprovalFlowConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisciplineApprovalFlowConfig
        fields = ['id', 'name', 'roles', 'is_active', 'created_at', 'updated_at']


class DisciplineIncidentActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisciplineIncidentAction
        fields = [
            'id',
            'incident',
            'action_type',
            'role_performed',
            'user',
            'user_name',
            'comments',
            'fine_amount',
            'document_url',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class DisciplineCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = DisciplineCategory
        fields = ['id', 'title', 'description', 'semesters', 'severity', 'is_active', 'created_at', 'updated_at']


class DisciplineIncidentLogSerializer(serializers.ModelSerializer):
    actions = DisciplineIncidentActionSerializer(many=True, read_only=True)
    profile_image_url = serializers.SerializerMethodField()
    reported_by_profile_image_url = serializers.SerializerMethodField()
    reported_by_department = serializers.SerializerMethodField()
    assigned_approver_name = serializers.SerializerMethodField()
    assigned_approver_username = serializers.SerializerMethodField()
    assigned_approver_department = serializers.SerializerMethodField()

    class Meta:
        model = DisciplineIncidentLog
        fields = [
            'id',
            'student',
            'student_name',
            'reg_no',
            'username',
            'profile_image_url',
            'department_name',
            'section_name',
            'batch_name',
            'category',
            'category_title',
            'severity',
            'status',
            'reported_by',
            'reported_by_name',
            'reported_by_profile_image_url',
            'reported_by_department',
            'assigned_approver_name',
            'assigned_approver_username',
            'assigned_approver_department',
            'remarks',
            'action_notes',
            'flow_roles',
            'current_step_index',
            'current_role',
            'has_fine',
            'fine_amount',
            'fine_fixed_by',
            'fine_fixed_at',
            'receipt_document',
            'receipt_document_url',
            'receipt_notes',
            'receipt_uploaded_at',
            'actions',
            'incident_date',
            'updated_at',
        ]
        read_only_fields = ['id', 'incident_date', 'updated_at']

    def _resolve_assigned_staff(self, obj):
        if not obj.current_role:
            return None
        role_code = obj.current_role.strip().upper()
        if role_code not in ['MENTOR', 'ADVISOR', 'HOD', 'AHOD']:
            return None

        # Resolve student
        student = obj.student
        if student is None and obj.reg_no:
            student = StudentProfile.objects.filter(
                Q(reg_no__iexact=obj.reg_no) | Q(user__username__iexact=obj.reg_no)
            ).select_related(
                'user', 'home_department', 'section', 'section__batch',
                'section__batch__course', 'section__batch__course__department'
            ).first()

        if not student:
            return None

        from academics.models import AcademicYear, Department
        from academics.services import authority_resolver

        academic_year = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()

        if role_code == 'MENTOR':
            return authority_resolver.get_student_mentor(student)
        elif role_code == 'ADVISOR':
            return authority_resolver.get_section_advisor(student, academic_year) if academic_year else None
        elif role_code == 'HOD':
            dept = authority_resolver._get_student_department(student)
            if not dept and obj.department_name:
                dept = Department.objects.filter(
                    Q(name__iexact=obj.department_name) | Q(short_name__iexact=obj.department_name)
                ).first()
            return authority_resolver.get_department_hod_by_department(dept, academic_year) if dept and academic_year else None
        elif role_code == 'AHOD':
            dept = authority_resolver._get_student_department(student)
            if not dept and obj.department_name:
                dept = Department.objects.filter(
                    Q(name__iexact=obj.department_name) | Q(short_name__iexact=obj.department_name)
                ).first()
            return authority_resolver.get_department_ahod_by_department(dept, academic_year) if dept and academic_year else None
        return None

    def get_assigned_approver_name(self, obj):
        staff = self._resolve_assigned_staff(obj)
        if staff and staff.user:
            return f"{staff.user.first_name} {staff.user.last_name}".strip() or staff.user.username
        return ''

    def get_assigned_approver_username(self, obj):
        staff = self._resolve_assigned_staff(obj)
        if staff and staff.user:
            return staff.user.username
        return ''

    def get_assigned_approver_department(self, obj):
        staff = self._resolve_assigned_staff(obj)
        if staff and staff.department:
            return getattr(staff.department, 'short_name', None) or getattr(staff.department, 'name', '')
        return ''

    def get_profile_image_url(self, obj):
        # 1. Try from linked StudentProfile
        if obj.student:
            if getattr(obj.student, 'profile_image', None):
                try:
                    return obj.student.profile_image.url
                except Exception:
                    pass
            if obj.student.user:
                img = getattr(obj.student.user, 'profile_image', '')
                if img:
                    return f"/media/{img}" if not img.startswith('http') and not img.startswith('/') else img

        # 2. Try looking up StudentProfile by reg_no if student FK wasn't set
        if obj.reg_no:
            st = StudentProfile.objects.filter(
                Q(reg_no__iexact=obj.reg_no) |
                Q(user__username__iexact=obj.reg_no)
            ).select_related('user').first()
            if st:
                if getattr(st, 'profile_image', None):
                    try:
                        return st.profile_image.url
                    except Exception:
                        pass
                if st.user and getattr(st.user, 'profile_image', None):
                    img = getattr(st.user, 'profile_image', '')
                    if img:
                        return f"/media/{img}" if not img.startswith('http') and not img.startswith('/') else img
        return None

    def get_reported_by_profile_image_url(self, obj):
        if obj.reported_by:
            u = obj.reported_by
            # Check staff_profile first
            staff_prof = getattr(u, 'staff_profile', None)
            if staff_prof and getattr(staff_prof, 'profile_image', None):
                try:
                    return staff_prof.profile_image.url
                except Exception:
                    pass
            img = getattr(u, 'profile_image', '')
            if img:
                return f"/media/{img}" if not img.startswith('http') and not img.startswith('/') else img
        return None

    def get_reported_by_department(self, obj):
        if obj.reported_by:
            staff_prof = getattr(obj.reported_by, 'staff_profile', None)
            if staff_prof and staff_prof.department:
                return getattr(staff_prof.department, 'short_name', None) or getattr(staff_prof.department, 'name', '')
        return ''


class DisciplineStudentDirectorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    reg_no = serializers.CharField()
    name = serializers.CharField()
    username = serializers.CharField()
    email = serializers.CharField(allow_blank=True, required=False)
    profile_image_url = serializers.CharField(allow_null=True, required=False)
    department = serializers.CharField(allow_blank=True, required=False)
    batch = serializers.CharField(allow_blank=True, required=False)
    section = serializers.CharField(allow_blank=True, required=False)
    status = serializers.CharField(allow_blank=True, required=False)

