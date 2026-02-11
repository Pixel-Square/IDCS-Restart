from rest_framework import serializers

from applications import models as app_models


class ApplicationFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = app_models.ApplicationField
        fields = ('field_key', 'label', 'field_type', 'is_required', 'order', 'meta')


class ApplicationFormVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = app_models.ApplicationFormVersion
        fields = ('version', 'schema', 'is_active', 'created_at')


class ApplicationTypeListSerializer(serializers.ModelSerializer):
    class Meta:
        model = app_models.ApplicationType
        fields = ('id', 'name', 'code', 'description')


class ApplicationTypeSchemaSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    code = serializers.CharField()
    description = serializers.CharField()
    fields = ApplicationFieldSerializer(many=True)
    active_form = ApplicationFormVersionSerializer(allow_null=True)
    role_permissions = serializers.SerializerMethodField()

    def get_role_permissions(self, obj):
        # Return simple list of role ids and flags for client-side decisions
        perms = obj.role_permissions.all()
        return [
            {
                'role_id': p.role_id,
                'role_name': getattr(p.role, 'name', None),
                'can_edit_all': p.can_edit_all,
                'can_override_flow': p.can_override_flow,
            }
            for p in perms
        ]
