from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Role, UserRole, Permission, RolePermission
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

    def get_roles(self, obj):
        return [r.name for r in obj.roles.all()]

    def get_permissions(self, obj):
        from .utils import get_user_permissions

        perms = get_user_permissions(obj)
        # return sorted list for consistency
        return sorted(perms)


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
