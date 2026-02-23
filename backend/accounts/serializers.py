from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Role, UserRole, Permission, RolePermission, NotificationTemplate
from rest_framework_simplejwt.tokens import RefreshToken

from typing import Optional

User = get_user_model()


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ('code', 'description')


class RolePermissionSerializer(serializers.ModelSerializer):
    permission = PermissionSerializer(read_only=True)

    class Meta:
        model = RolePermission
        fields = ('permission',)


class RoleSerializer(serializers.ModelSerializer):
    role_permissions = RolePermissionSerializer(many=True, read_only=True)

    class Meta:
        model = Role
        fields = ('id', 'name', 'description', 'role_permissions')


class UserSerializer(serializers.ModelSerializer):
    roles = RoleSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'roles')


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email'),
            password=validated_data['password'],
        )
        return user


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    profile_type = serializers.SerializerMethodField()
    profile = serializers.SerializerMethodField()
    college = serializers.SerializerMethodField()

    def get_roles(self, obj):
        roles = [r.name for r in obj.roles.all()]

        # Add DepartmentRole-based roles (HOD/AHOD) as effective roles.
        try:
            staff_profile = getattr(obj, 'staff_profile', None)
            if staff_profile is not None:
                from academics.models import DepartmentRole

                dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True).values_list('role', flat=True)
                existing = {str(r).upper() for r in roles}
                for r in dept_roles:
                    ru = str(r).upper()
                    if ru and ru not in existing:
                        roles.append(ru)
                        existing.add(ru)
        except Exception:
            pass

        return roles

    def get_permissions(self, obj):
        from .utils import get_user_permissions

        perms = get_user_permissions(obj)
        # return sorted list for consistency
        return sorted(perms)

    def get_profile_type(self, obj):
        # Explicit profile type for frontend
        if hasattr(obj, 'student_profile') and obj.student_profile is not None:
            return 'STUDENT'
        if hasattr(obj, 'staff_profile') and obj.staff_profile is not None:
            return 'STAFF'
        return None

    def get_profile(self, obj):
        # Minimal profile payload to avoid touching academic serializers
        if hasattr(obj, 'student_profile') and obj.student_profile is not None:
            sp = obj.student_profile
            # prefer the active assignment (current_section) over legacy `section` field
            cur_sec = None
            try:
                cur_sec = sp.current_section
            except Exception:
                cur_sec = getattr(sp, 'section', None)

            sec_obj = cur_sec
            batch = getattr(sec_obj, 'batch', None)
            course = getattr(batch, 'course', None) if batch else None
            department = getattr(course, 'department', None) if course else None

            return {
                'reg_no': sp.reg_no,
                'mobile_number': getattr(sp, 'mobile_number', '') or '',
                'mobile_verified': bool(getattr(sp, 'mobile_number_verified_at', None)),
                'section_id': getattr(sec_obj, 'id', None),
                'section': getattr(sec_obj, 'name', None),
                'batch': getattr(batch, 'name', sp.batch),
                'department': {
                    'id': getattr(department, 'id', None),
                    'code': getattr(department, 'code', None),
                    'short_name': getattr(department, 'short_name', None),
                    'name': getattr(department, 'name', None),
                } if department else None,
                'status': sp.status,
            }
        if hasattr(obj, 'staff_profile') and obj.staff_profile is not None:
            st = obj.staff_profile
            return {
                'staff_id': st.staff_id,
                'mobile_number': getattr(st, 'mobile_number', '') or '',
                'mobile_verified': bool(getattr(st, 'mobile_number_verified_at', None)),
                'department': {
                    'code': getattr(st.department, 'code', None),
                    'name': getattr(st.department, 'name', None),
                    'short_name': getattr(st.department, 'short_name', None),
                },
                'designation': st.designation,
                'status': st.status,
            }
        return None

    def get_college(self, obj):
        # Return the primary college record if available
        try:
            from college.models import College
            c = College.objects.filter(is_active=True).order_by('id').first()
            if not c:
                return None
            return {
                'code': c.code,
                'name': c.name,
                'short_name': c.short_name,
            }
        except Exception:
            return None


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = ('code', 'name', 'template', 'enabled', 'expiry_minutes', 'updated_at')


class IdentifierTokenObtainPairSerializer(serializers.Serializer):
    """Authenticate using `identifier` + `password` and return JWT pair.

    `identifier` may be an email (contains '@') or an academic identifier
    (student `reg_no` or staff `staff_id`) resolved via the `academics` app.
    """
    identifier = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = attrs.get('identifier')
        password = attrs.get('password')

        if not identifier or not password:
            raise serializers.ValidationError('Must include "identifier" and "password".')

        User = get_user_model()
        user: Optional[User] = None

        # resolve by email
        if '@' in identifier:
            user = User.objects.filter(email__iexact=identifier).first()

        # if not an email, try student reg_no then staff_id
        if user is None:
            try:
                from academics.models import StudentProfile, StaffProfile
            except Exception:
                StudentProfile = StaffProfile = None

            if StudentProfile is not None:
                sp = StudentProfile.objects.filter(reg_no__iexact=identifier).select_related('user').first()
                if sp:
                    user = sp.user

            if user is None and StaffProfile is not None:
                st = StaffProfile.objects.filter(staff_id__iexact=identifier).select_related('user').first()
                if st:
                    user = st.user

        # generic error message to avoid leaking which part failed
        invalid_msg = 'Unable to log in with provided credentials.'

        if user is None:
            raise serializers.ValidationError(invalid_msg)

        if not user.check_password(password):
            raise serializers.ValidationError(invalid_msg)

        if not getattr(user, 'is_active', True):
            raise serializers.ValidationError('User account is disabled.')

        # Build tokens
        refresh = RefreshToken.for_user(user)

        # add roles claim to tokens for convenience
        try:
            refresh['roles'] = [r.name for r in user.roles.all()]
        except Exception:
            refresh['roles'] = []

        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }
