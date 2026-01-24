from rest_framework import serializers

from applications import models as app_models


class ApprovalActionSerializer(serializers.ModelSerializer):
    step_order = serializers.SerializerMethodField()
    step_role = serializers.SerializerMethodField()
    acted_by = serializers.SerializerMethodField()

    class Meta:
        model = app_models.ApprovalAction
        fields = ('id', 'action', 'remarks', 'acted_at', 'acted_by', 'step_order', 'step_role')
        read_only_fields = fields

    def get_step_order(self, obj):
        return obj.step.order if obj.step else None

    def get_step_role(self, obj):
        return obj.step.role.name if obj.step and obj.step.role else None

    def get_acted_by(self, obj):
        return obj.acted_by.username if obj.acted_by else None


class ApplicationApprovalHistorySerializer(serializers.ModelSerializer):
    step_order = serializers.SerializerMethodField()
    step_role = serializers.SerializerMethodField()
    acted_by = serializers.SerializerMethodField()

    class Meta:
        model = app_models.ApprovalAction
        fields = ('step_order', 'step_role', 'action', 'acted_by', 'remarks', 'acted_at')
        read_only_fields = fields

    def get_step_order(self, obj):
        return obj.step.order if obj.step else None

    def get_step_role(self, obj):
        return obj.step.role.name if obj.step and obj.step.role else None

    def get_acted_by(self, obj):
        if not obj.acted_by:
            return None
        user = obj.acted_by
        # include id, username and role names (if any)
        try:
            roles = [r.name for r in user.roles.all()]
        except Exception:
            roles = []
        primary_role = roles[0] if roles else None
        return {
            'id': user.id,
            'username': getattr(user, 'username', None),
            'roles': roles,
            'primary_role': primary_role,
        }
