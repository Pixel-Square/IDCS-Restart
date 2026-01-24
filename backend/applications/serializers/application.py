from typing import Dict
from django.utils import timezone
from rest_framework import serializers

from applications import models as app_models
from applications.services import approval_engine


class ApplicationCreateSerializer(serializers.Serializer):
    application_type = serializers.PrimaryKeyRelatedField(queryset=app_models.ApplicationType.objects.filter(is_active=True))
    data = serializers.DictField(child=serializers.JSONField(), allow_empty=False)

    def validate(self, attrs):
        app_type = attrs['application_type']
        provided_keys = set(attrs['data'].keys())

        # Load expected fields for the application type
        fields_qs = app_models.ApplicationField.objects.filter(application_type=app_type)
        expected_keys = set(f.field_key for f in fields_qs)

        # Required fields must be present
        required_keys = set(f.field_key for f in fields_qs if f.is_required)
        missing = required_keys - provided_keys
        if missing:
            raise serializers.ValidationError({
                'data': f'Missing required fields: {", ".join(sorted(missing))}'
            })

        # Ensure no unknown keys provided
        unknown = provided_keys - expected_keys
        if unknown:
            raise serializers.ValidationError({
                'data': f'Unknown field keys for this application type: {", ".join(sorted(unknown))}'
            })

        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError('Authentication required to create application')

        app_type = validated_data['application_type']
        data: Dict = validated_data['data']

        application = app_models.Application.objects.create(
            application_type=app_type,
            applicant_user=user,
            status=app_models.Application.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )

        # Persist ApplicationData rows
        fields_map = {f.field_key: f for f in app_models.ApplicationField.objects.filter(application_type=app_type)}
        rows = []
        for key, val in data.items():
            field = fields_map.get(key)
            if not field:
                continue
            rows.append(app_models.ApplicationData(application=application, field=field, value=val))

        app_models.ApplicationData.objects.bulk_create(rows)

        # Set initial current_step to the first step (engine determines it lazily, but set to be explicit)
        first_step = approval_engine.get_current_approval_step(application)
        if first_step:
            application.current_step = first_step
            application.save(update_fields=['current_step'])

        return application


class ApplicationListSerializer(serializers.ModelSerializer):
    application_type_name = serializers.SerializerMethodField()

    class Meta:
        model = app_models.Application
        fields = ('id', 'application_type_name', 'status', 'created_at')

    def get_application_type_name(self, obj):
        return obj.application_type.name if obj.application_type else None


class ApplicationDetailSerializer(serializers.ModelSerializer):
    application_type = serializers.SerializerMethodField()
    dynamic_fields = serializers.SerializerMethodField()
    current_step = serializers.SerializerMethodField()
    approval_history = serializers.SerializerMethodField()

    class Meta:
        model = app_models.Application
        fields = ('id', 'application_type', 'status', 'created_at', 'submitted_at', 'dynamic_fields', 'current_step', 'approval_history')

    def get_application_type(self, obj):
        return obj.application_type.name if obj.application_type else None

    def get_dynamic_fields(self, obj):
        # Return list of {label, field_key, value}
        data = []
        qs = obj.data.select_related('field')
        for ad in qs:
            data.append({
                'label': ad.field.label,
                'field_key': ad.field.field_key,
                'value': ad.value,
            })
        return data

    def get_current_step(self, obj):
        step = approval_engine.get_current_approval_step(obj)
        return step.role.name if step and step.role else None

    def get_approval_history(self, obj):
        actions = obj.actions.order_by('acted_at')
        return ApprovalActionSerializer(actions, many=True).data
