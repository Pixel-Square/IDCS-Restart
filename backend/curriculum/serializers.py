from rest_framework import serializers
from .models import CurriculumMaster, CurriculumDepartment, ElectiveSubject
from academics.models import Department, Semester


class DepartmentSmallSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ('id', 'code', 'name', 'short_name')


class CurriculumMasterSerializer(serializers.ModelSerializer):
    departments = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), many=True, required=False)
    departments_display = DepartmentSmallSerializer(source='departments', many=True, read_only=True)
    # expose semester number for frontend convenience and accept semester_id on writes
    semester = serializers.IntegerField(source='semester.number', read_only=True)
    semester_id = serializers.PrimaryKeyRelatedField(queryset=Semester.objects.all(), source='semester', write_only=True, required=False)

    class Meta:
        model = CurriculumMaster
        fields = [
            'id', 'regulation', 'semester', 'semester_id', 'course_code', 'course_name', 'class_type', 'category',
            'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark', 'is_elective',
            'for_all_departments', 'departments', 'departments_display', 'editable', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ('created_by', 'created_at', 'updated_at')

    def create(self, validated_data):
        deps = validated_data.pop('departments', [])
        user = self.context['request'].user
        validated_data['created_by'] = user
        master = CurriculumMaster.objects.create(**validated_data)
        if deps:
            master.departments.set(deps)
            master.for_all_departments = False
            master.save()
        return master


class CurriculumDepartmentSerializer(serializers.ModelSerializer):
    department = DepartmentSmallSerializer(read_only=True)
    department_id = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), source='department', write_only=True)
    semester = serializers.IntegerField(source='semester.number', read_only=True)
    semester_id = serializers.PrimaryKeyRelatedField(queryset=Semester.objects.all(), source='semester', write_only=True, required=False)

    class Meta:
        model = CurriculumDepartment
        fields = [
            'id', 'master', 'department', 'department_id', 'regulation', 'semester', 'semester_id', 'course_code', 'course_name',
            'class_type', 'category', 'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark', 'is_elective',
            'total_hours', 'question_paper_type', 'editable', 'overridden',
            'approval_status', 'approved_by', 'approved_at',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ('created_by', 'created_at', 'updated_at')

    def update(self, instance, validated_data):
        # Respect model-level protection; model.save will raise ValidationError if not allowed
        user = self.context['request'].user
        validated_data['created_by'] = instance.created_by or user
        # If a non-IQAC/HAA user edits, mark approval_status as PENDING and clear approver
        request = self.context['request']
        u = request.user
        # determine if user is privileged to approve
        privileged = u.is_superuser or u.groups.filter(name__in=['IQAC', 'HAA']).exists()
        if not privileged:
            validated_data['approval_status'] = CurriculumDepartment.APPROVAL_PENDING
            validated_data['approved_by'] = None
            validated_data['approved_at'] = None
            validated_data['overridden'] = True
        return super().update(instance, validated_data)


class ElectiveSubjectSerializer(serializers.ModelSerializer):
    department = DepartmentSmallSerializer(read_only=True)
    department_id = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), source='department', write_only=True)
    semester = serializers.IntegerField(source='semester.number', read_only=True)
    semester_id = serializers.PrimaryKeyRelatedField(queryset=Semester.objects.all(), source='semester', write_only=True, required=False)

    class Meta:
        model = ElectiveSubject
        fields = [
            'id', 'parent', 'department', 'department_id', 'regulation', 'semester', 'semester_id', 'course_code', 'course_name',
            'class_type', 'category', 'is_elective', 'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
            'total_hours', 'question_paper_type', 'editable', 'overridden',
            'approval_status', 'approved_by', 'approved_at',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ('created_by', 'created_at', 'updated_at')

    def create(self, validated_data):
        user = self.context['request'].user
        validated_data['created_by'] = user
        return super().create(validated_data)
