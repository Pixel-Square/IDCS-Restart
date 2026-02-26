from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Role, UserRole, Permission, RolePermission, NotificationTemplate, UserQuery
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
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
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
                'student_id': sp.reg_no,  # Alias for consistency
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
                'address': c.address,
            }
        except Exception:
            return None


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = ('code', 'name', 'template', 'enabled', 'expiry_minutes', 'updated_at')


class UserQuerySerializer(serializers.ModelSerializer):
    """Serializer for user queries, doubts, errors, and bug reports."""
    username = serializers.CharField(source='user.username', read_only=True)
    serial_number = serializers.SerializerMethodField()
    user_roles = serializers.SerializerMethodField()
    user_department = serializers.SerializerMethodField()
    dept_serial_number = serializers.SerializerMethodField()
    mobile_number = serializers.SerializerMethodField()
    mobile_verified = serializers.SerializerMethodField()
    
    class Meta:
        model = UserQuery
        fields = ('id', 'serial_number', 'user', 'username', 'user_roles', 'user_department', 'dept_serial_number', 'mobile_number', 'mobile_verified', 'query_text', 'status', 'created_at', 'updated_at', 'admin_notes')
        read_only_fields = ('id', 'serial_number', 'user', 'username', 'user_roles', 'user_department', 'dept_serial_number', 'mobile_number', 'mobile_verified', 'created_at', 'updated_at', 'admin_notes', 'status')
    
    def get_serial_number(self, obj):
        """Calculate serial number based on creation order (oldest = 1)."""
        return UserQuery.objects.filter(created_at__lt=obj.created_at).count() + 1
    
    def get_user_roles(self, obj):
        """Get user's roles as a list of role names."""
        return [ur.role.name for ur in obj.user.user_roles.select_related('role').all()]
    
    def get_user_department(self, obj):
        """Get user's department information if available."""
        try:
            if hasattr(obj.user, 'staff_profile'):
                dept = obj.user.staff_profile.current_department
                if dept:
                    return {'id': dept.id, 'code': dept.code, 'name': dept.name, 'short_name': dept.short_name}
            elif hasattr(obj.user, 'student_profile'):
                student = obj.user.student_profile
                # Get department through section->batch->course->department
                section = student.current_section or student.section
                if section and hasattr(section, 'batch') and section.batch:
                    dept = section.batch.course.department
                    if dept:
                        return {'id': dept.id, 'code': dept.code, 'name': dept.name, 'short_name': dept.short_name}
        except Exception:
            pass
        return None
    
    def get_dept_serial_number(self, obj):
        """Calculate department-wise serial number for the token."""
        try:
            dept_id = None
            if hasattr(obj.user, 'staff_profile'):
                dept = obj.user.staff_profile.current_department
                if dept:
                    dept_id = dept.id
            elif hasattr(obj.user, 'student_profile'):
                student = obj.user.student_profile
                section = student.current_section or student.section
                if section and hasattr(section, 'batch') and section.batch:
                    dept = section.batch.course.department
                    if dept:
                        dept_id = dept.id
            
            if dept_id:
                # Count tokens from same department created before this one
                from django.db.models import Q
                count = UserQuery.objects.filter(
                    Q(user__staff_profile__current_department_id=dept_id) | 
                    Q(user__student_profile__section__batch__course__department_id=dept_id),
                    created_at__lt=obj.created_at
                ).count()
                return count + 1
        except Exception:
            pass
        return None
    
    def get_mobile_number(self, obj):
        """Get user's mobile number from their profile."""
        try:
            if hasattr(obj.user, 'staff_profile'):
                return obj.user.staff_profile.mobile_number or None
            elif hasattr(obj.user, 'student_profile'):
                return obj.user.student_profile.mobile_number or None
        except Exception:
            pass
        return None
    
    def get_mobile_verified(self, obj):
        """Get user's mobile verification status from their profile."""
        try:
            if hasattr(obj.user, 'staff_profile'):
                return bool(obj.user.staff_profile.mobile_verified)
            elif hasattr(obj.user, 'student_profile'):
                return bool(obj.user.student_profile.mobile_verified)
        except Exception:
            pass
        return False
    
    def create(self, validated_data):
        # Set the user from context
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class UserQueryListSerializer(serializers.ModelSerializer):
    """Minimal serializer for listing queries."""
    username = serializers.CharField(source='user.username', read_only=True)
    query_preview = serializers.SerializerMethodField()
    serial_number = serializers.SerializerMethodField()
    
    class Meta:
        model = UserQuery
        fields = ('id', 'serial_number', 'username', 'query_preview', 'status', 'admin_notes', 'created_at', 'updated_at')
    
    def get_query_preview(self, obj):
        """Return first 100 characters of query text."""
        return obj.query_text[:100] + '...' if len(obj.query_text) > 100 else obj.query_text
    
    def get_serial_number(self, obj):
        """Calculate serial number based on creation order (oldest = 1)."""
        return UserQuery.objects.filter(created_at__lt=obj.created_at).count() + 1


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

        # Check for inactive or debarred students
        if hasattr(user, 'student_profile') and user.student_profile:
            student_status = getattr(user.student_profile, 'status', 'ACTIVE')
            if student_status == 'INACTIVE':
                raise serializers.ValidationError('Your student account is inactive. Please contact administration.')
            if student_status == 'DEBAR':
                raise serializers.ValidationError('Your student account has been debarred. Please contact administration.')

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
