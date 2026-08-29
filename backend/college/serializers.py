from rest_framework import serializers
from .models import College, FeatureCatalog, CollegeFeature
from accounts.models import User, Role


class CollegeSerializer(serializers.ModelSerializer):
    admin_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    admin_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    admin_password = serializers.CharField(write_only=True, required=False, allow_blank=True, style={'input_type': 'password'})
    logo_url = serializers.SerializerMethodField(read_only=True)
    banner_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = College
        fields = [
            'id', 'code', 'name', 'short_name',
            'address', 'city', 'state', 'country', 'postal_code',
            'phone', 'email', 'website',
            'established_year', 'logo', 'banner', 'logo_url', 'banner_url', 'is_active',
            'created_at', 'updated_at',
            'admin_username', 'admin_email', 'admin_password',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'logo_url', 'banner_url']

    def get_logo_url(self, obj):
        if obj.logo:
            try:
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(obj.logo.url)
                return obj.logo.url
            except Exception:
                return str(obj.logo)
        return None

    def get_banner_url(self, obj):
        if obj.banner:
            try:
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(obj.banner.url)
                return obj.banner.url
            except Exception:
                return str(obj.banner)
        return None

    def validate(self, data):
        username = data.get('admin_username')
        email = data.get('admin_email')
        password = data.get('admin_password')
        if any([username, email, password]) and not all([username, email, password]):
            raise serializers.ValidationError("To create an admin, admin_username, admin_email, and admin_password must all be provided.")
        if email and User.objects.filter(email=email).exists():
            raise serializers.ValidationError({"admin_email": f"A user with email {email} already exists."})
        return data

    def create(self, validated_data):
        username = validated_data.pop('admin_username', None)
        email = validated_data.pop('admin_email', None)
        password = validated_data.pop('admin_password', None)

        college = super().create(validated_data)

        # ── Ensure default roles exist system-wide for every new college ────
        # STUDENT and STAFF are fixed base roles that must always be present
        # so that the Roles & Permissions page shows them and users can be
        # assigned immediately without any extra setup.
        Role.objects.get_or_create(
            name='STUDENT',
            defaults={'description': 'Default role for all enrolled students'},
        )
        Role.objects.get_or_create(
            name='STAFF',
            defaults={'description': 'Default role for all staff / faculty members'},
        )

        if username and email and password:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                is_staff=True
            )
            from academics.models import StaffProfile
            StaffProfile.objects.create(
                user=user,
                college=college,
                staff_id=f"ADMIN-{college.code or college.id}-{username}",
                status='ACTIVE'
            )
            admin_role, _ = Role.objects.get_or_create(
                name='ADMIN',
                defaults={'description': 'College administrator role'},
            )
            user.roles.add(admin_role)

        return college

    def update(self, instance, validated_data):
        username = validated_data.pop('admin_username', None)
        email = validated_data.pop('admin_email', None)
        password = validated_data.pop('admin_password', None)

        college = super().update(instance, validated_data)

        if username and email and password:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                is_staff=True
            )
            from academics.models import StaffProfile
            StaffProfile.objects.create(
                user=user,
                college=college,
                staff_id=f"ADMIN-{college.code or college.id}-{username}",
                status='ACTIVE'
            )
            admin_role = Role.objects.filter(name__iexact='ADMIN').first()
            if not admin_role:
                admin_role = Role.objects.create(name='ADMIN')
            user.roles.add(admin_role)

        return college


class CollegeUserSerializer(serializers.Serializer):
    """Flat serializer that merges User + profile data for college user listing."""
    id = serializers.IntegerField(source='user.id')
    username = serializers.CharField(source='user.username')
    email = serializers.CharField(source='user.email')
    first_name = serializers.CharField(source='user.first_name')
    last_name = serializers.CharField(source='user.last_name')
    profile_id = serializers.IntegerField(source='id')
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
        if self._is_student(obj):
            dept = getattr(obj, 'home_department', None)
            if not dept:
                sec = getattr(obj, 'get_current_section', lambda: None)() or getattr(obj, 'section', None)
                if sec:
                    if getattr(sec, 'batch', None) and getattr(sec.batch, 'course', None) and getattr(sec.batch.course, 'department', None):
                        dept = sec.batch.course.department
                    elif getattr(sec, 'batch', None) and getattr(sec.batch, 'department', None):
                        dept = sec.batch.department
                    elif getattr(sec, 'managing_department', None) and not sec.managing_department.is_sh_main:
                        dept = sec.managing_department
        else:
            dept = getattr(obj, 'department', None)
        if dept:
            return {'id': dept.id, 'code': dept.code, 'name': dept.name}
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
            raw_roles = obj.user.roles.values_list('name', flat=True)
            return sorted(list(set(str(r).strip().upper() for r in raw_roles if r)))
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
