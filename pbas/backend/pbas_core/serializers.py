from __future__ import annotations
from typing import Any
from rest_framework import serializers
from accounts.models import College
from .models import PBASCustomDepartment, PBASNode, PBASSubmission, PBASDuration

ALLOWED_UPLOAD_EXTS = {'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'}
MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024

class PBASCustomDepartmentSerializer(serializers.ModelSerializer):
    department_id = serializers.IntegerField(source='academic_department.id', read_only=True)
    department_code = serializers.CharField(source='academic_department.code', read_only=True)
    department_short_name = serializers.CharField(source='academic_department.short_name', read_only=True)
    department_name = serializers.CharField(source='academic_department.name', read_only=True)

    class Meta:
        model = PBASCustomDepartment
        fields = (
            'id', 'title', 'accesses', 'show_in_submission', 'department_id',
            'department_code', 'department_short_name', 'department_name', 'created_at'
        )
        read_only_fields = ('id', 'created_at')

class PBASNodeTreeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    approvers = serializers.SerializerMethodField()

    class Meta:
        model = PBASNode
        fields = (
            'id', 'label', 'audience', 'input_mode', 'form_schema', 'link',
            'uploaded_name', 'limit', 'pbas_credit', 'mentor_credit',
            'college_required', 'position', 'approvers', 'children',
        )

    def get_approvers(self, obj: PBASNode):
        return [
            {
                'id': u.id,
                'username': u.username,
                'name': u.get_full_name() or u.username,
            }
            for u in obj.approvers.all()
        ]

    def get_children(self, obj: PBASNode):
        qs = obj.children.all().order_by('position', 'created_at')
        audience_filter = self.context.get('audience_filter')
        if audience_filter:
            qs = qs.filter(audience__in=audience_filter)
        return PBASNodeTreeSerializer(qs, many=True, context=self.context).data

class PBASSubmissionSerializer(serializers.ModelSerializer):
    leaf_title = serializers.SerializerMethodField()
    parent_path = serializers.SerializerMethodField()
    pbas_credit = serializers.SerializerMethodField()
    student_credit = serializers.SerializerMethodField()
    mentor_credit = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    form_schema = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    user_reg_or_staff_id = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()

    class Meta:
        model = PBASSubmission
        fields = (
            'id', 'node', 'leaf_title', 'parent_path', 'pbas_credit', 'student_credit',
            'mentor_credit', 'submission_type', 'form_data', 'form_schema', 'link',
            'file', 'file_name', 'college', 'status', 'current_step', 'approval_history',
            'approved_by_name', 'reviewed_at', 'rejection_reason', 'created_at',
            'user_name', 'user_reg_or_staff_id', 'department_name'
        )
        read_only_fields = (
            'id', 'file_name', 'created_at', 'status', 'current_step', 'approval_history',
            'reviewed_at', 'rejection_reason', 'form_schema'
        )

    def get_form_schema(self, obj):
        return obj.node.form_schema if (obj.node and obj.node.form_schema) else []

    def get_leaf_title(self, obj):
        return obj.node.label if obj.node else ''

    def get_parent_path(self, obj):
        if not obj.node:
            return ''
        parts = []
        curr = obj.node.parent
        while curr:
            parts.append(curr.label)
            curr = curr.parent
        parts.reverse()
        return ' > '.join(parts) if parts else 'Root Category'

    def get_pbas_credit(self, obj):
        return obj.node.pbas_credit if (obj.node and obj.node.pbas_credit is not None) else 0

    def get_student_credit(self, obj):
        return obj.node.pbas_credit if (obj.node and obj.node.pbas_credit is not None) else 0

    def get_mentor_credit(self, obj):
        return obj.node.mentor_credit if (obj.node and obj.node.mentor_credit is not None) else 0

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username if obj.user else 'Unknown'

    def get_user_reg_or_staff_id(self, obj):
        if not obj.user:
            return ''
        if hasattr(obj.user, 'staff_profile') and obj.user.staff_profile:
            return obj.user.staff_profile.staff_id
        if hasattr(obj.user, 'student_profile') and obj.user.student_profile:
            return obj.user.student_profile.reg_no
        return obj.user.username

    def get_department_name(self, obj):
        if not obj.user:
            return ''
        if hasattr(obj.user, 'staff_profile') and obj.user.staff_profile and obj.user.staff_profile.department:
            return obj.user.staff_profile.department.name
        if hasattr(obj.user, 'student_profile') and obj.user.student_profile and obj.user.student_profile.home_department:
            return obj.user.student_profile.home_department.name
        return ''

    def validate(self, attrs: dict[str, Any]):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        attrs['user'] = user
        return attrs

class PBASDurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PBASDuration
        fields = ('id', 'title', 'start_date', 'end_date', 'created_at')
        read_only_fields = ('id', 'created_at')
