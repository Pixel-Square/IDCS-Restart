from rest_framework import serializers
from .models import CurriculumMaster, CurriculumDepartment, ElectiveSubject, DepartmentGroup, DepartmentGroupMapping
from academics.models import Department, Semester, Batch, BatchYear, AcademicYear


class BatchSmallSerializer(serializers.ModelSerializer):
    class Meta:
        model = BatchYear
        fields = ('id', 'name', 'start_year', 'end_year')


class DepartmentSmallSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ('id', 'code', 'name', 'short_name')


class CurriculumMasterSerializer(serializers.ModelSerializer):
    departments = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), many=True, required=False)
    departments_display = DepartmentSmallSerializer(source='departments', many=True, read_only=True)
    # expose semester number for frontend convenience and accept semester_id on writes
    semester = serializers.IntegerField(source='semester.number', read_only=True)
    semester_id = serializers.PrimaryKeyRelatedField(
        queryset=Semester.objects.all(), 
        source='semester', 
        write_only=True, 
        required=False,
        allow_null=True
    )
    batch = BatchSmallSerializer(read_only=True)
    batch_id = serializers.PrimaryKeyRelatedField(
        queryset=BatchYear.objects.all(),
        source='batch',
        write_only=True,
        required=False,
        allow_null=True
    )

    class Meta:
        model = CurriculumMaster
        fields = [
            'id', 'regulation', 'semester', 'semester_id', 'batch', 'batch_id', 'course_code', 'course_name', 'class_type', 'qp_type', 'category',
            'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark', 'is_elective', 'enabled_assessments',
            'for_all_departments', 'departments', 'departments_display', 'editable', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ('created_by', 'created_at', 'updated_at')
    
    def validate(self, attrs):
        # For create operations, semester is required - try to get it from semester_id or infer from semester number
        if not self.instance and 'semester' not in attrs:
            # Check if there's a semester number we can use
            request = self.context.get('request')
            if request and request.data:
                sem_num = request.data.get('semester')
                if sem_num:
                    try:
                        # Get or create the Semester object
                        sem_obj, _ = Semester.objects.get_or_create(number=int(sem_num))
                        attrs['semester'] = sem_obj
                    except (ValueError, TypeError):
                        pass
            
            # If still no semester, raise validation error
            if 'semester' not in attrs:
                raise serializers.ValidationError({
                    'semester': 'Semester is required. Provide either semester_id (Semester PK) or semester (semester number).'
                })
        return attrs

    def create(self, validated_data):
        deps = validated_data.pop('departments', [])
        # created_by will be set by perform_create in the viewset
        # so don't override it here if it's already in validated_data
        if 'created_by' not in validated_data:
            try:
                user = self.context.get('request').user if self.context.get('request') else None
                if user:
                    validated_data['created_by'] = user
            except Exception:
                pass
        
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
    batch = BatchSmallSerializer(read_only=True)
    batch_id = serializers.PrimaryKeyRelatedField(
        queryset=BatchYear.objects.all(),
        source='batch',
        write_only=True,
        required=False,
        allow_null=True
    )

    class Meta:
        model = CurriculumDepartment
        fields = [
            'id', 'master', 'department', 'department_id', 'regulation', 'semester', 'semester_id', 'batch', 'batch_id', 'course_code', 'course_name',
            'mnemonic', 'class_type', 'category', 'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark', 'is_elective', 'is_dept_core', 'enabled_assessments',
            'total_hours', 'question_paper_type', 'editable', 'overridden',
            'approval_status', 'approved_by', 'approved_at',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ('created_by', 'created_at', 'updated_at')

    def update(self, instance, validated_data):
        # Respect model-level protection; model.save will raise ValidationError if not allowed
        user = self.context['request'].user
        validated_data['created_by'] = instance.created_by or user

        # Auto-populate enabled_assessments when switching to SPECIAL class type
        # without explicitly providing assessments (prevents validation error).
        new_ct = str(validated_data.get('class_type', instance.class_type) or '').upper()
        if new_ct == 'SPECIAL':
            ea = validated_data.get('enabled_assessments', None)
            # If not provided in PATCH payload, check existing value on instance
            if ea is None:
                ea = instance.enabled_assessments
            if not ea:
                # Default to all SPECIAL assessment options
                from curriculum.models import SPECIAL_ASSESSMENT_CHOICES
                validated_data['enabled_assessments'] = [k for k, _ in SPECIAL_ASSESSMENT_CHOICES]
        elif 'class_type' in validated_data and new_ct != 'SPECIAL':
            # Clear enabled_assessments when switching away from SPECIAL
            validated_data.setdefault('enabled_assessments', [])

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


class DepartmentGroupSmallSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepartmentGroup
        fields = ('id', 'code', 'name')


class DepartmentGroupSerializer(serializers.ModelSerializer):
    """Full serializer for DepartmentGroup with mapping info."""
    department_count = serializers.SerializerMethodField()
    
    class Meta:
        model = DepartmentGroup
        fields = ('id', 'code', 'name', 'description', 'is_active', 'department_count', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at')
    
    def get_department_count(self, obj):
        return obj.department_mappings.filter(is_active=True).count()


class ElectiveSubjectSerializer(serializers.ModelSerializer):
    department = DepartmentSmallSerializer(read_only=True)
    department_id = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), source='department', write_only=True)
    department_group = DepartmentGroupSmallSerializer(read_only=True)
    department_group_id = serializers.PrimaryKeyRelatedField(queryset=DepartmentGroup.objects.all(), source='department_group', write_only=True, required=False, allow_null=True)
    semester = serializers.IntegerField(source='semester.number', read_only=True)
    semester_id = serializers.PrimaryKeyRelatedField(queryset=Semester.objects.all(), source='semester', write_only=True, required=False)
    batch = BatchSmallSerializer(read_only=True)
    batch_id = serializers.PrimaryKeyRelatedField(
        queryset=BatchYear.objects.all(),
        source='batch',
        write_only=True,
        required=False,
        allow_null=True
    )
    student_count = serializers.IntegerField(read_only=True, default=0)
    # Indicates if this elective is from another department via group mapping
    is_cross_department = serializers.SerializerMethodField()
    owner_department_name = serializers.SerializerMethodField()
    parent_name = serializers.SerializerMethodField()
    parent_is_dept_core = serializers.SerializerMethodField()
    parent_department_id = serializers.SerializerMethodField()

    class Meta:
        model = ElectiveSubject
        fields = [
            'id', 'parent', 'parent_name', 'parent_is_dept_core', 'parent_department_id',
            'department', 'department_id', 'department_group', 'department_group_id',
            'batch', 'batch_id', 'regulation', 'semester', 'semester_id', 'course_code', 'course_name',
            'class_type', 'category', 'is_elective', 'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
            'total_hours', 'question_paper_type', 'editable', 'overridden',
            'approval_status', 'approved_by', 'approved_at',
            'student_count', 'is_cross_department', 'owner_department_name',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ('created_by', 'created_at', 'updated_at', 'student_count', 'is_cross_department', 'owner_department_name', 'parent_name', 'parent_is_dept_core', 'parent_department_id')
    
    def get_is_cross_department(self, obj):
        """Check if this elective is being shown in a different department's view via group mapping."""
        request = self.context.get('request')
        if not request:
            return False
        
        # Get the department_id from query params
        queried_dept_id = request.query_params.get('department_id')
        if not queried_dept_id:
            return False
        
        try:
            queried_dept_id = int(queried_dept_id)
            # If the elective's department is different from the queried department, it's cross-department
            return obj.department_id != queried_dept_id
        except (ValueError, TypeError):
            return False
    
    def get_owner_department_name(self, obj):
        """Return the owner department's name for cross-department electives."""
        if self.get_is_cross_department(obj):
            dept = obj.department
            return f"{dept.code} - {dept.short_name or dept.name}" if dept else None
        return None
    
    def get_parent_name(self, obj):
        """Return the parent curriculum row's course name."""
        if obj.parent:
            return obj.parent.course_name or obj.parent.course_code or f"Elective {obj.parent.id}"
        return None

    def get_parent_is_dept_core(self, obj):
        """Return True when the parent curriculum row is marked is_dept_core."""
        if obj.parent:
            return getattr(obj.parent, 'is_dept_core', False)
        return False

    def get_parent_department_id(self, obj):
        """Return the parent curriculum row's department ID."""
        if obj.parent:
            return obj.parent.department_id
        return None

    def create(self, validated_data):
        user = self.context['request'].user
        validated_data['created_by'] = user
        return super().create(validated_data)


class ElectiveChoiceSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    student_id = serializers.IntegerField(allow_null=True, required=False)
    student_reg_no = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    student_name = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    student_username = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    section_id = serializers.IntegerField(allow_null=True, required=False)
    section_name = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    elective_subject_id = serializers.IntegerField(allow_null=True, required=False)
    elective_subject_code = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    elective_subject_name = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    parent_id = serializers.IntegerField(allow_null=True, required=False)
    parent_name = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    department_id = serializers.IntegerField(allow_null=True, required=False)
    department_code = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    department_name = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    regulation = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    semester = serializers.IntegerField(allow_null=True, required=False)
    academic_year_id = serializers.IntegerField(allow_null=True, required=False)
    academic_year_name = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    is_active = serializers.BooleanField(required=False)
    created_at = serializers.DateTimeField(required=False)
    updated_at = serializers.DateTimeField(required=False)

    def to_representation(self, obj):
        student = getattr(obj, 'student', None)
        user = getattr(student, 'user', None)
        elective_subject = getattr(obj, 'elective_subject', None)
        parent = getattr(elective_subject, 'parent', None)
        department = getattr(elective_subject, 'department', None)
        academic_year = getattr(obj, 'academic_year', None)

        student_name = ''
        if student:
            student_name = (
                getattr(student, 'name', None)
                or getattr(user, 'get_full_name', lambda: '')()
                or getattr(user, 'username', None)
                or getattr(student, 'reg_no', None)
                or ''
            )

        section = getattr(student, 'section', None)
        section_name = ''
        if section:
            section_name = getattr(section, 'name', None) or str(section)

        elective_code = getattr(elective_subject, 'course_code', None) or ''
        elective_name = getattr(elective_subject, 'course_name', None) or ''

        parent_name = None
        if parent:
            parent_name = getattr(parent, 'course_name', None) or getattr(parent, 'course_code', None) or f'Elective {getattr(parent, "id", "")}'

        department_name = None
        if department:
            department_name = getattr(department, 'short_name', None) or getattr(department, 'name', None)

        return {
            'id': getattr(obj, 'id', None),
            'student_id': getattr(student, 'id', None),
            'student_reg_no': getattr(student, 'reg_no', None),
            'student_name': student_name,
            'student_username': getattr(user, 'username', None),
            'section_id': getattr(student, 'section_id', None),
            'section_name': section_name,
            'elective_subject_id': getattr(elective_subject, 'id', None),
            'elective_subject_code': elective_code,
            'elective_subject_name': elective_name,
            'parent_id': getattr(parent, 'id', None),
            'parent_name': parent_name,
            'department_id': getattr(department, 'id', None),
            'department_code': getattr(department, 'code', None),
            'department_name': department_name,
            'regulation': getattr(elective_subject, 'regulation', None),
            'semester': getattr(getattr(elective_subject, 'semester', None), 'number', None),
            'academic_year_id': getattr(academic_year, 'id', None),
            'academic_year_name': getattr(academic_year, 'name', None),
            'is_active': getattr(obj, 'is_active', False),
            'created_at': getattr(obj, 'created_at', None),
            'updated_at': getattr(obj, 'updated_at', None),
            # Backward-compatible keys used by the attendance pages.
            'reg_no': getattr(student, 'reg_no', None),
            'username': getattr(user, 'username', None),
            'academic_year': getattr(academic_year, 'name', None),
        }
