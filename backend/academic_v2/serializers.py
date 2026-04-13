"""
Academic 2.1 Serializers
"""

from rest_framework import serializers
from .models import (
    AcV2SemesterConfig,
    AcV2ClassType,
    AcV2QpPattern,
    AcV2Course,
    AcV2Section,
    AcV2ExamAssignment,
    AcV2StudentMark,
    AcV2UserPatternOverride,
    AcV2EditRequest,
    AcV2InternalMark,
)


class AcV2SemesterConfigSerializer(serializers.ModelSerializer):
    semester_name = serializers.CharField(source='semester.name', read_only=True)
    is_open = serializers.SerializerMethodField()
    time_remaining_seconds = serializers.SerializerMethodField()
    
    class Meta:
        model = AcV2SemesterConfig
        fields = [
            'id', 'semester', 'semester_name',
            'publish_control_enabled', 'approval_workflow', 'approval_window_minutes',
            'open_from', 'due_at', 'auto_publish_on_due',
            'is_open', 'time_remaining_seconds',
            'updated_by', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']
    
    def get_is_open(self, obj):
        return obj.is_open()
    
    def get_time_remaining_seconds(self, obj):
        remaining = obj.time_remaining()
        if remaining:
            return int(remaining.total_seconds())
        return None


class AcV2ClassTypeSerializer(serializers.ModelSerializer):
    enabled_exams = serializers.SerializerMethodField()
    total_weight = serializers.SerializerMethodField()
    
    class Meta:
        model = AcV2ClassType
        fields = [
            'id', 'name', 'short_code', 'display_name',
            'total_internal_marks', 'allow_customize_questions',
            'exam_assignments', 'default_co_count',
            'enabled_exams', 'total_weight',
            'is_active', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']
        # Suppress auto-generated unique validators so updates don't
        # falsely reject an unchanged name on the same instance.
        validators = []
    
    def validate_name(self, value):
        """Check uniqueness manually, excluding the current instance on updates."""
        instance = self.instance
        qs = AcV2ClassType.objects.filter(name__iexact=value)
        if instance is not None:
            qs = qs.exclude(pk=instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Class Type with this name already exists.")
        return value

    def get_enabled_exams(self, obj):
        return obj.get_enabled_exams()
    
    def get_total_weight(self, obj):
        return obj.get_total_weight()


class AcV2QpPatternSerializer(serializers.ModelSerializer):
    class_type_name = serializers.CharField(source='class_type.name', read_only=True, allow_null=True)
    questions = serializers.SerializerMethodField()
    
    class Meta:
        model = AcV2QpPattern
        fields = [
            'id', 'name', 'default_weight', 'qp_type', 'class_type', 'class_type_name',
            'pattern', 'questions',
            'batch', 'is_active', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']
    
    def get_questions(self, obj):
        return obj.get_questions()


class AcV2CourseSerializer(serializers.ModelSerializer):
    class_type_info = AcV2ClassTypeSerializer(source='class_type', read_only=True)
    
    class Meta:
        model = AcV2Course
        fields = [
            'id', 'subject', 'semester',
            'subject_code', 'subject_name',
            'class_type', 'class_type_info', 'class_type_name',
            'question_paper_type', 'co_count', 'co_titles',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcV2SectionSerializer(serializers.ModelSerializer):
    course_info = AcV2CourseSerializer(source='course', read_only=True)
    faculty_name = serializers.CharField(source='faculty_user.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = AcV2Section
        fields = [
            'id', 'course', 'course_info',
            'teaching_assignment', 'section_name',
            'faculty_user', 'faculty_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcV2ExamAssignmentSerializer(serializers.ModelSerializer):
    section_info = AcV2SectionSerializer(source='section', read_only=True)
    is_editable = serializers.SerializerMethodField()
    is_past_due = serializers.SerializerMethodField()
    publish_control = serializers.SerializerMethodField()
    question_btls = serializers.SerializerMethodField()
    
    class Meta:
        model = AcV2ExamAssignment
        fields = [
            'id', 'section', 'section_info',
            'exam', 'exam_display_name', 'qp_type',
            'max_marks', 'weight', 'covered_cos',
            'qp_pattern', 'allow_customize',
            'status', 'draft_data', 'published_data',
            'published_at', 'published_by',
            'has_pending_edit_request', 'edit_window_until',
            'last_saved_at', 'last_saved_by',
            'is_editable', 'is_past_due', 'publish_control',
            'question_btls',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'published_at', 'published_by']
    
    def get_question_btls(self, obj):
        draft = obj.draft_data if isinstance(obj.draft_data, dict) else {}
        return draft.get('question_btls', {})
    
    def get_is_editable(self, obj):
        return obj.is_editable()
    
    def get_is_past_due(self, obj):
        return obj.is_past_due()
    
    def get_publish_control(self, obj):
        from .services.publish_control import check_publish_control
        ctrl = check_publish_control(obj)
        # Convert timedelta to seconds
        if ctrl.get('time_remaining'):
            ctrl['time_remaining_seconds'] = int(ctrl['time_remaining'].total_seconds())
            del ctrl['time_remaining']
        return ctrl


class AcV2StudentMarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcV2StudentMark
        fields = [
            'id', 'exam_assignment',
            'student', 'reg_no', 'student_name',
            'co1_mark', 'co2_mark', 'co3_mark', 'co4_mark', 'co5_mark',
            'total_mark', 'weighted_mark',
            'question_marks',
            'is_absent', 'is_exempted', 'remarks',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcV2StudentMarkBulkSerializer(serializers.Serializer):
    """Serializer for bulk mark entry."""
    marks = serializers.ListField(
        child=serializers.DictField()
    )


class AcV2EditRequestSerializer(serializers.ModelSerializer):
    exam_info = serializers.SerializerMethodField()
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    
    class Meta:
        model = AcV2EditRequest
        fields = [
            'id', 'exam_assignment', 'exam_info',
            'requested_by', 'requested_by_name', 'requested_at',
            'reason', 'status', 'current_stage',
            'approval_history', 'approved_until',
            'reviewed_by', 'reviewed_at', 'rejection_reason',
        ]
        read_only_fields = ['id', 'requested_at', 'reviewed_at']
    
    def get_exam_info(self, obj):
        ea = obj.exam_assignment
        return {
            'exam': ea.exam,
            'subject_code': ea.section.course.subject_code,
            'subject_name': ea.section.course.subject_name,
            'section_name': ea.section.section_name,
        }


class AcV2InternalMarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcV2InternalMark
        fields = [
            'id', 'section', 'student',
            'reg_no', 'student_name',
            'weighted_marks',
            'co1_total', 'co2_total', 'co3_total', 'co4_total', 'co5_total',
            'final_mark', 'max_mark',
            'computed_at',
        ]
        read_only_fields = '__all__'


class AcV2UserPatternOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcV2UserPatternOverride
        fields = [
            'id', 'course', 'exam_type',
            'created_by', 'pattern',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']
