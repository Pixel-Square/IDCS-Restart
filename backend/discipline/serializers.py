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
        fields = ['id', 'title', 'description', 'semesters', 'severity', 'require_comment', 'is_active', 'created_at', 'updated_at']


class DisciplineIncidentLogSerializer(serializers.ModelSerializer):
    actions = DisciplineIncidentActionSerializer(many=True, read_only=True)
    profile_image_url = serializers.SerializerMethodField()
    reported_by_profile_image_url = serializers.SerializerMethodField()
    reported_by_department = serializers.SerializerMethodField()
    assigned_approver_name = serializers.SerializerMethodField()
    assigned_approver_username = serializers.SerializerMethodField()
    assigned_approver_department = serializers.SerializerMethodField()
    is_actionable = serializers.SerializerMethodField()
    flow_authorities = serializers.SerializerMethodField()
    flow_stages = serializers.SerializerMethodField()

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
            'flow_authorities',
            'flow_stages',
            'current_step_index',
            'current_role',
            'is_actionable',
            'has_fine',
            'fine_amount',
            'fine_fixed_by',
            'fine_fixed_at',
            'incident_document',
            'incident_document_url',
            'receipt_document',
            'receipt_document_url',
            'receipt_notes',
            'receipt_uploaded_at',
            'actions',
            'incident_date',
            'updated_at',
        ]
        read_only_fields = ['id', 'incident_date', 'updated_at']

    def get_is_actionable(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if obj.status in ['RESOLVED', 'DISMISSED']:
            return False
        from .views import is_user_approver_for_incident
        return is_user_approver_for_incident(request.user, obj)

    def _resolve_assigned_staff(self, obj, target_role=None):
        role_code = (target_role or obj.current_role or '').strip().upper()
        if not role_code or role_code not in ['MENTOR', 'ADVISOR', 'HOD', 'AHOD']:
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

    def get_flow_authorities(self, obj):
        """
        Returns a dictionary mapping role codes to the specific student's actual designated authorities.
        """
        authorities = {
            'SUBMITTER': obj.reported_by_name or 'Reporting Faculty',
            'DISCIPLINE_COMMITTEE': 'Discipline Officer',
            'DISCIPLINECOMMITTEEADMIN': 'Discipline Cell In-Charge',
            'PRINCIPAL': 'Dr. D. Sriram',
        }
        for role in ['ADVISOR', 'MENTOR', 'HOD', 'AHOD']:
            staff = self._resolve_assigned_staff(obj, target_role=role)
            if staff and staff.user:
                name = f"{staff.user.first_name} {staff.user.last_name}".strip() or staff.user.username
                authorities[role] = name

        return authorities

    def get_flow_stages(self, obj):
        """
        Returns the sequential list of stages in the forward approval ladder with exact assigned users.
        """
        authorities = self.get_flow_authorities(obj)
        flow_roles = obj.flow_roles or []
        current_idx = obj.current_step_index if obj.current_step_index is not None else 0
        actions = list(obj.actions.all())

        stages = []

        # 0. Submitter Origin
        stages.append({
            'step_index': 0,
            'role_key': 'SUBMITTER',
            'role_title': 'Submitter (Origin)',
            'assigned_name': authorities.get('SUBMITTER', 'Reporting Faculty'),
            'status': 'SUBMITTED',
            'is_done': True,
            'is_current': False,
        })

        # Intermediate Stages
        for idx, role in enumerate(flow_roles):
            role_clean = role.strip().upper()
            is_done = idx < current_idx or obj.status == 'RESOLVED'
            is_current = idx == current_idx and obj.status != 'RESOLVED'

            # Look for specific action performed by this role if already forwarded
            past_action = next(
                (a for a in actions if a.role_performed and a.role_performed.strip().upper() == role_clean and a.action_type in ['FORWARDED', 'APPROVED']),
                None
            )

            expected_authority_name = authorities.get(role_clean, role.replace('_', ' '))
            performer_name = past_action.user_name if (past_action and past_action.user_name) else expected_authority_name

            stages.append({
                'step_index': idx + 1,
                'role_key': role_clean,
                'role_title': role.replace('_', ' '),
                'assigned_name': performer_name,
                'status': 'FORWARDED' if is_done else ('PENDING' if is_current else 'UPCOMING'),
                'is_done': is_done,
                'is_current': is_current,
            })

        # Finalizer Stage
        is_final_done = obj.status == 'RESOLVED'
        is_final_current = current_idx >= len(flow_roles) and not is_final_done
        final_role = flow_roles[-1] if flow_roles else 'FINAL_APPROVER'
        final_authority_name = authorities.get(final_role.strip().upper(), 'Final Approver')

        stages.append({
            'step_index': len(flow_roles) + 1,
            'role_key': 'FINAL_APPROVER',
            'role_title': 'Final Approver',
            'assigned_name': final_authority_name,
            'status': 'RESOLVED' if is_final_done else ('PENDING' if is_final_current else 'UPCOMING'),
            'is_done': is_final_done,
            'is_current': is_final_current,
        })

        return stages


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

