from rest_framework import serializers
from .models import College, FeatureCatalog, CollegeFeature
from accounts.models import User, Role


class CollegeSerializer(serializers.ModelSerializer):
    class Meta:
        model = College
        fields = [
            'id', 'code', 'name', 'short_name',
            'address', 'city', 'state', 'country', 'postal_code',
            'phone', 'email', 'website',
            'established_year', 'logo', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CollegeUserSerializer(serializers.Serializer):
    """Flat serializer that merges User + profile data for college user listing."""
    id = serializers.IntegerField(source='user.id')
    username = serializers.CharField(source='user.username')
    email = serializers.CharField(source='user.email')
    first_name = serializers.CharField(source='user.first_name')
    last_name = serializers.CharField(source='user.last_name')
    profile_type = serializers.SerializerMethodField()
    reg_no = serializers.SerializerMethodField()
    staff_id = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    designation = serializers.SerializerMethodField()
    batch = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    created_at = serializers.SerializerMethodField()

    def _is_student(self, obj):
        return hasattr(obj, 'reg_no')

    def get_profile_type(self, obj):
        return 'STUDENT' if self._is_student(obj) else 'STAFF'

    def get_reg_no(self, obj):
        return getattr(obj, 'reg_no', '') if self._is_student(obj) else ''

    def get_staff_id(self, obj):
        return getattr(obj, 'staff_id', '') if not self._is_student(obj) else ''

    def get_department(self, obj):
        dept = getattr(obj, 'department', None)
        if dept:
            return {'id': dept.id, 'code': dept.code, 'name': str(dept)}
        return None

    def get_designation(self, obj):
        return getattr(obj, 'designation', '') if not self._is_student(obj) else ''

    def get_batch(self, obj):
        return getattr(obj, 'batch', '') if self._is_student(obj) else ''

    def get_status(self, obj):
        return getattr(obj, 'status', 'ACTIVE')

    def get_phone(self, obj):
        return getattr(obj, 'mobile_number', '') or getattr(obj.user, 'mobile_no', '')

    def get_roles(self, obj):
        try:
            return list(obj.user.roles.values_list('name', flat=True))
        except Exception:
            return []

    def get_created_at(self, obj):
        try:
            return obj.user.date_joined.isoformat()
        except Exception:
            return ''


class CollegeFeatureSerializer(serializers.Serializer):
    """Merged view: feature catalog info + per-college toggle state."""
    code = serializers.CharField(source='feature.code')
    name = serializers.CharField(source='feature.name')
    description = serializers.CharField(source='feature.description')
    category = serializers.CharField(source='feature.category')
    icon = serializers.CharField(source='feature.icon')
    sort_order = serializers.IntegerField(source='feature.sort_order')
    applicable_roles = serializers.CharField(source='feature.applicable_roles')
    sidebar_keys = serializers.CharField(source='feature.sidebar_keys')
    is_enabled = serializers.BooleanField()
    enabled_at = serializers.DateTimeField()
    disabled_at = serializers.DateTimeField()
