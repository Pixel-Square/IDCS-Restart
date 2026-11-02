from rest_framework import serializers
from .models import User, Role, Department, College, StaffProfile, StudentProfile

class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ('id', 'name', 'description')

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ('id', 'code', 'name', 'short_name')

class CollegeSerializer(serializers.ModelSerializer):
    class Meta:
        model = College
        fields = ('id', 'code', 'name', 'short_name')

class StaffProfileSerializer(serializers.ModelSerializer):
    department = DepartmentSerializer(read_only=True)
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), source='department', write_only=True, required=False
    )

    class Meta:
        model = StaffProfile
        fields = (
            'id', 'staff_id', 'department', 'department_id', 'designation',
            'pbas_credit', 'pbas_academics_credit', 'pbas_student_development_credit',
            'pbas_research_development_credit', 'pbas_institutional_contribution_credit'
        )

class StudentProfileSerializer(serializers.ModelSerializer):
    home_department = DepartmentSerializer(read_only=True)

    class Meta:
        model = StudentProfile
        fields = ('id', 'reg_no', 'home_department', 'batch', 'pbas_credit')

class UserSerializer(serializers.ModelSerializer):
    roles = RoleSerializer(many=True, read_only=True)
    role_names = serializers.SerializerMethodField()
    staff_profile = StaffProfileSerializer(read_only=True)
    student_profile = StudentProfileSerializer(read_only=True)
    profile_type = serializers.CharField(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'roles', 'role_names', 'profile_type', 'staff_profile', 'student_profile',
            'is_superuser', 'is_staff'
        )

    def get_role_names(self, obj):
        return obj.get_role_names()

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username
