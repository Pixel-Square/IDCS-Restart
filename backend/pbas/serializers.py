from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from college.models import College

from .models import PBASCustomDepartment, PBASNode, PBASSubmission


ALLOWED_UPLOAD_EXTS = {'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'}
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024


class PBASCustomDepartmentSerializer(serializers.ModelSerializer):
    department_id = serializers.IntegerField(source='academic_department.id', read_only=True)
    department_code = serializers.CharField(source='academic_department.code', read_only=True)
    department_short_name = serializers.CharField(source='academic_department.short_name', read_only=True)
    department_name = serializers.CharField(source='academic_department.name', read_only=True)

    class Meta:
        model = PBASCustomDepartment
        fields = (
            'id',
            'title',
            'accesses',
            'show_in_submission',
            'department_id',
            'department_code',
            'department_short_name',
            'department_name',
            'created_by',
            'created_at',
        )
        read_only_fields = ('id', 'show_in_submission', 'created_by', 'created_at')


class PBASNodeTreeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    approvers = serializers.SerializerMethodField()

    class Meta:
        model = PBASNode
        fields = (
            'id',
            'label',
            'audience',
            'input_mode',
            'link',
            'uploaded_name',
            'limit',
            'pbas_credit',
            'college_required',
            'position',
            'approvers',
            'children',
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


class CollegeSerializer(serializers.ModelSerializer):
    class Meta:
        model = College
        fields = ('id', 'code', 'name')


class PBASSubmissionSerializer(serializers.ModelSerializer):
    leaf_title = serializers.SerializerMethodField()
    parent_path = serializers.SerializerMethodField()
    pbas_credit = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PBASSubmission
        fields = (
            'id',
            'node',
            'leaf_title',
            'parent_path',
            'pbas_credit',
            'submission_type',
            'link',
            'file',
            'file_name',
            'college',
            'status',
            'approved_by_name',
            'reviewed_at',
            'rejection_reason',
            'created_at',
        )
        read_only_fields = ('id', 'file_name', 'created_at', 'status', 'reviewed_at', 'rejection_reason')

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

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None

    def validate_file(self, f):
        if not f:
            return f

        # size check
        try:
            if getattr(f, 'size', 0) > MAX_UPLOAD_SIZE_BYTES:
                raise serializers.ValidationError('Max upload size is 10 MB.')
        except Exception:
            # if size not available, keep going
            pass

        # extension check
        name = getattr(f, 'name', '') or ''
        ext = (name.rsplit('.', 1)[-1] if '.' in name else '').lower()
        if ext not in ALLOWED_UPLOAD_EXTS:
            raise serializers.ValidationError('Only PDF/images are allowed: pdf/png/jpg/jpeg/webp/gif.')
        return f

    def validate(self, attrs: dict[str, Any]):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        attrs['user'] = user

        node: PBASNode = attrs.get('node')
        submission_type = (attrs.get('submission_type') or '').lower()
        link = attrs.get('link')
        file = attrs.get('file')
        college = attrs.get('college')

        if not node:
            raise serializers.ValidationError({'node': 'Node is required.'})

        # Only allow submissions to leaf nodes
        try:
            if node.children.exists():
                raise serializers.ValidationError({'node': 'Evidence can be submitted only to a leaf node.'})
        except Exception:
            pass

        # Enforce node input_mode
        if submission_type and submission_type != (node.input_mode or '').lower():
            raise serializers.ValidationError({'submission_type': 'Submission type must match node input_mode.'})

        if submission_type == PBASSubmission.SubmissionType.LINK:
            if not link:
                raise serializers.ValidationError({'link': 'Link is required.'})
            if file:
                raise serializers.ValidationError({'file': 'File must be empty for link submissions.'})
        elif submission_type == PBASSubmission.SubmissionType.UPLOAD:
            if not file:
                raise serializers.ValidationError({'file': 'File is required.'})
            if link:
                raise serializers.ValidationError({'link': 'Link must be empty for upload submissions.'})
        else:
            raise serializers.ValidationError({'submission_type': 'submission_type must be upload or link.'})

        if node.college_required and not college:
            raise serializers.ValidationError({'college': 'College is required for this node.'})

        return attrs

    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict)

