"""
IDCS Coder - Serializers
"""
import random
from rest_framework import serializers
from .models import (
    CodeCourse,
    CodeCourseIncharge,
    CodeClass,
    CodeSectionIncharge,
    CodeEnrollment,
    CodeSession,
    CodeAssessment,
    MCQQuestion,
    CodingProject,
    ProjectFolder,
    ProjectFile,
    LockedCodeRegion,
    TestCase,
    CodeSubmission,
    MCQSubmission,
    StudentProgress,
    CodeExecution,
    CodeExecutionSession,
)
from django.contrib.auth import get_user_model

User = get_user_model()


class BasicUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'full_name']

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.username


# ---------------------------------------------------------------------------
# CodeCourse
# ---------------------------------------------------------------------------

class CodeCourseSerializer(serializers.ModelSerializer):
    incharge_count = serializers.SerializerMethodField()

    class Meta:
        model = CodeCourse
        fields = [
            'id', 'name', 'code', 'description', 'thumbnail',
            'academic_year', 'status', 'created_at', 'updated_at', 'incharge_count',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_incharge_count(self, obj):
        return obj.incharge_assignments.filter(is_active=True).count()


class CodeCourseDetailSerializer(CodeCourseSerializer):
    incharges = serializers.SerializerMethodField()

    class Meta(CodeCourseSerializer.Meta):
        fields = CodeCourseSerializer.Meta.fields + ['incharges']

    def get_incharges(self, obj):
        qs = obj.incharge_assignments.filter(is_active=True).select_related('user')
        return [
            {
                'id': a.id,
                'user_id': a.user_id,
                'username': a.user.username,
                'email': a.user.email,
                'full_name': f"{a.user.first_name} {a.user.last_name}".strip() or a.user.username,
            }
            for a in qs
        ]


# ---------------------------------------------------------------------------
# CodeCourseIncharge
# ---------------------------------------------------------------------------

class CodeCourseInchargeSerializer(serializers.ModelSerializer):
    user = BasicUserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True,
    )
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)

    class Meta:
        model = CodeCourseIncharge
        fields = [
            'id', 'course', 'course_name', 'course_code',
            'user', 'user_id', 'assigned_at', 'is_active',
        ]
        read_only_fields = ['id', 'assigned_at']


# ---------------------------------------------------------------------------
# CodeClass
# ---------------------------------------------------------------------------

class CodeClassSerializer(serializers.ModelSerializer):
    section_name = serializers.SerializerMethodField()
    enrollment_count = serializers.SerializerMethodField()
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)

    class Meta:
        model = CodeClass
        fields = [
            'id', 'course', 'course_name', 'course_code',
            'name', 'idcs_section', 'section_name',
            'academic_year', 'is_active', 'created_at', 'enrollment_count',
        ]
        read_only_fields = ['id', 'created_at']

    def get_section_name(self, obj):
        if obj.idcs_section:
            return str(obj.idcs_section)
        return None

    def get_enrollment_count(self, obj):
        return obj.enrollments.filter(is_active=True).count()


# ---------------------------------------------------------------------------
# CodeSectionIncharge
# ---------------------------------------------------------------------------

class CodeSectionInchargeSerializer(serializers.ModelSerializer):
    user = BasicUserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True,
    )
    class_name = serializers.CharField(source='code_class.name', read_only=True)
    course_name = serializers.CharField(source='code_class.course.name', read_only=True)

    class Meta:
        model = CodeSectionIncharge
        fields = [
            'id', 'code_class', 'class_name', 'course_name',
            'user', 'user_id', 'assigned_at', 'is_active',
        ]
        read_only_fields = ['id', 'assigned_at']


# ---------------------------------------------------------------------------
# CodeSession
# ---------------------------------------------------------------------------

class CodeSessionSerializer(serializers.ModelSerializer):
    assessment_count = serializers.SerializerMethodField()

    class Meta:
        model = CodeSession
        fields = [
            'id', 'course', 'title', 'description', 'order',
            'session_type', 'is_published', 'created_at', 'updated_at', 'assessment_count',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_assessment_count(self, obj):
        return obj.assessments.count()


# ---------------------------------------------------------------------------
# CodeAssessment
# ---------------------------------------------------------------------------

class CodeAssessmentSerializer(serializers.ModelSerializer):
    session_title = serializers.CharField(source='session.title', read_only=True)
    course_id = serializers.IntegerField(source='session.course_id', read_only=True)

    class Meta:
        model = CodeAssessment
        fields = [
            'id', 'session', 'session_title', 'course_id',
            'title', 'description', 'assessment_type',
            'total_marks', 'duration_minutes', 'max_attempts', 'status',
            'start_time', 'end_time', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# ---------------------------------------------------------------------------
# MCQQuestion  (never expose correct_answer to students)
# ---------------------------------------------------------------------------

class MCQQuestionAdminSerializer(serializers.ModelSerializer):
    """Full serializer for incharge/admin — shows correct answer."""

    class Meta:
        model = MCQQuestion
        fields = [
            'id', 'assessment', 'question_text', 'correct_answer',
            'wrong_ans1', 'wrong_ans2', 'wrong_ans3', 'order', 'marks',
        ]
        read_only_fields = ['id']


class MCQQuestionStudentSerializer(serializers.ModelSerializer):
    """Student-facing: shuffled options, no correct_answer exposed."""
    options = serializers.SerializerMethodField()

    class Meta:
        model = MCQQuestion
        fields = ['id', 'question_text', 'options', 'marks', 'order']

    def get_options(self, obj):
        opts = [
            obj.correct_answer,
            obj.wrong_ans1,
            obj.wrong_ans2,
            obj.wrong_ans3,
        ]
        random.shuffle(opts)
        return opts


# ---------------------------------------------------------------------------
# CodingProject / Files / Folders
# ---------------------------------------------------------------------------

class LockedCodeRegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LockedCodeRegion
        fields = ['id', 'file', 'start_line', 'start_column', 'end_line', 'end_column', 'label']
        read_only_fields = ['id']


class ProjectFileSerializer(serializers.ModelSerializer):
    locked_regions = LockedCodeRegionSerializer(many=True, read_only=True)
    path = serializers.SerializerMethodField()

    class Meta:
        model = ProjectFile
        fields = [
            'id', 'project', 'folder', 'name', 'content',
            'is_locked', 'locked_regions', 'path', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_path(self, obj):
        return obj.get_path()


class ProjectFileStudentSerializer(ProjectFileSerializer):
    """Student view — content included but locked regions are enforced on backend."""
    pass


class ProjectFolderSerializer(serializers.ModelSerializer):
    files = ProjectFileSerializer(many=True, read_only=True)
    path = serializers.SerializerMethodField()

    class Meta:
        model = ProjectFolder
        fields = ['id', 'project', 'parent', 'name', 'is_locked', 'path', 'files']
        read_only_fields = ['id']

    def get_path(self, obj):
        return obj.get_path()


class CodingProjectSerializer(serializers.ModelSerializer):
    folders = ProjectFolderSerializer(many=True, read_only=True)
    files = serializers.SerializerMethodField()
    single_file_filename = serializers.SerializerMethodField()

    class Meta:
        model = CodingProject
        fields = [
            'id', 'assessment', 'supported_languages',
            'time_limit_seconds', 'memory_limit_mb', 'cpu_limit',
            'entry_point', 'build_command', 'run_command',
            # Web execution fields
            'project_type', 'runtime', 'runtime_version', 'build_tool',
            'start_command', 'app_port', 'preview_enabled', 'env_vars',
            'working_directory',
            # Workspace type fields
            'workspace_type', 'single_file_name', 'single_file_language',
            'single_file_filename',
            'created_at', 'updated_at', 'folders', 'files',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'single_file_filename']

    def get_files(self, obj):
        # Root-level files (no folder)
        qs = obj.files.filter(folder__isnull=True)
        return ProjectFileSerializer(qs, many=True).data

    def get_single_file_filename(self, obj):
        """Compute the actual filename from name + language extension."""
        if obj.workspace_type != 'SINGLE_FILE':
            return None
        from .language_config import get_extension, normalise_filename
        return normalise_filename(obj.single_file_name, obj.single_file_language)



# ---------------------------------------------------------------------------
# TestCase  (hidden test case data never reaches student browser)
# ---------------------------------------------------------------------------

class TestCaseAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestCase
        fields = [
            'id', 'assessment', 'input_data', 'expected_output',
            'is_hidden', 'order', 'marks', 'description',
        ]
        read_only_fields = ['id']


class TestCasePublicSerializer(serializers.ModelSerializer):
    """Student-facing: only public test cases, no hidden ones."""
    class Meta:
        model = TestCase
        fields = ['id', 'input_data', 'expected_output', 'order', 'marks', 'description']


# ---------------------------------------------------------------------------
# CodeSubmission
# ---------------------------------------------------------------------------

class CodeSubmissionSerializer(serializers.ModelSerializer):
    student_reg_no = serializers.CharField(source='student.reg_no', read_only=True)
    assessment_title = serializers.CharField(source='assessment.title', read_only=True)

    class Meta:
        model = CodeSubmission
        fields = [
            'id', 'student', 'student_reg_no', 'assessment', 'assessment_title',
            'attempt_number', 'language', 'submitted_at',
            'execution_time_ms', 'status', 'score', 'total_score',
            'passed_tests', 'failed_tests', 'error_message', 'result_details',
        ]
        read_only_fields = [
            'id', 'submitted_at', 'execution_time_ms', 'status',
            'score', 'total_score', 'passed_tests', 'failed_tests',
            'error_message', 'result_details', 'attempt_number',
        ]


# ---------------------------------------------------------------------------
# MCQSubmission
# ---------------------------------------------------------------------------

class MCQSubmissionSerializer(serializers.ModelSerializer):
    student_reg_no = serializers.CharField(source='student.reg_no', read_only=True)
    assessment_title = serializers.CharField(source='assessment.title', read_only=True)

    class Meta:
        model = MCQSubmission
        fields = [
            'id', 'student', 'student_reg_no', 'assessment', 'assessment_title',
            'attempt_number', 'score', 'total_score', 'submitted_at', 'result_details',
        ]
        read_only_fields = [
            'id', 'submitted_at', 'score', 'total_score',
            'attempt_number', 'result_details',
        ]


# ---------------------------------------------------------------------------
# StudentProgress
# ---------------------------------------------------------------------------

class StudentProgressSerializer(serializers.ModelSerializer):
    percentage = serializers.FloatField(read_only=True)
    student_reg_no = serializers.CharField(source='student.reg_no', read_only=True)
    student_name = serializers.SerializerMethodField()
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)

    class Meta:
        model = StudentProgress
        fields = [
            'id', 'student', 'student_reg_no', 'student_name',
            'course', 'course_name', 'course_code',
            'completed_sessions', 'in_progress_sessions',
            'overall_score', 'total_possible_score', 'percentage',
            'last_accessed_at',
        ]
        read_only_fields = ['id', 'last_accessed_at', 'percentage']

    def get_student_name(self, obj):
        u = obj.student.user
        return f"{u.first_name} {u.last_name}".strip() or u.username


# ---------------------------------------------------------------------------
# CodeExecutionSession
# ---------------------------------------------------------------------------

class CodeExecutionSessionSerializer(serializers.ModelSerializer):
    preview_url = serializers.SerializerMethodField()

    class Meta:
        model = CodeExecutionSession
        fields = [
            'id', 'assessment', 'status', 'internal_port',
            'preview_token', 'preview_url',
            'build_log', 'run_log',
            'started_at', 'ready_at', 'stopped_at', 'expires_at',
            'exit_code',
        ]
        read_only_fields = fields

    def get_preview_url(self, obj):
        if obj.status == 'RUNNING' and obj.preview_token:
            return f'/api/coder/preview/{obj.preview_token}/'
        return None
