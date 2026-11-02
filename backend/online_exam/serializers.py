from rest_framework import serializers
from django.utils import timezone
from .models import OnlineExam, OnlineExamIncharge, OnlineExamQuestion, OnlineExamSubmission
from academics.models import Section


class OnlineExamQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnlineExamQuestion
        fields = ['id', 'question_number', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'co', 'marks']


class OnlineExamStudentQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnlineExamQuestion
        fields = ['id', 'question_number', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'co', 'marks']


class OnlineExamInchargeSerializer(serializers.ModelSerializer):
    staff_id = serializers.CharField(source='faculty_id', required=False, allow_blank=True)

    class Meta:
        model = OnlineExamIncharge
        fields = ['id', 'staff_id', 'faculty_id', 'staff_name', 'role', 'staff']


class OnlineExamListSerializer(serializers.ModelSerializer):
    incharges = OnlineExamInchargeSerializer(many=True, read_only=True)
    questions_count = serializers.SerializerMethodField()
    sections_details = serializers.SerializerMethodField()
    elapsed_seconds = serializers.SerializerMethodField()
    is_today = serializers.SerializerMethodField()
    submitted_count = serializers.SerializerMethodField()
    total_students_count = serializers.SerializerMethodField()

    class Meta:
        model = OnlineExam
        fields = [
            'id', 'title', 'exam_date', 'start_mode', 'auto_start_time',
            'duration_minutes', 'status', 'actual_start_time', 'actual_end_time',
            'course_code', 'course_name', 'sections_details', 'incharges',
            'questions_count', 'elapsed_seconds', 'is_today', 'created_at',
            'is_results_published', 'results_published_at',
            'submitted_count', 'total_students_count',
            'cooldown_seconds', 'max_violations'
        ]

    def get_questions_count(self, obj):
        return obj.questions.count()

    def get_sections_details(self, obj):
        res = []
        for s in obj.sections.select_related('batch', 'batch__department', 'batch__course__department', 'managing_department').all():
            dept = getattr(s, 'managing_department', None) or getattr(getattr(s, 'batch', None), 'department', None) or getattr(getattr(getattr(s, 'batch', None), 'course', None), 'department', None)
            dept_code = getattr(dept, 'short_name', '') or getattr(dept, 'code', '')
            batch_name = getattr(s.batch, 'name', '') if s.batch else ''
            label = f"{dept_code} - {s.name} ({batch_name})".strip(' -()') if dept_code else f"{s.name} ({batch_name})"
            res.append({
                'id': s.id,
                'name': s.name,
                'label': label,
                'batch_name': batch_name,
                'department_name': str(dept) if dept else ''
            })
        return res

    def get_elapsed_seconds(self, obj):
        if obj.status == 'RUNNING' and obj.actual_start_time:
            delta = timezone.now() - obj.actual_start_time
            return max(0, int(delta.total_seconds()))
        elif obj.status == 'ENDED' and obj.actual_start_time and obj.actual_end_time:
            delta = obj.actual_end_time - obj.actual_start_time
            return max(0, int(delta.total_seconds()))
        return 0

    def get_is_today(self, obj):
        today = timezone.localdate()
        return obj.exam_date == today

    def get_submitted_count(self, obj):
        return obj.submissions.filter(status='SUBMITTED').count()

    def get_total_students_count(self, obj):
        section_ids = [s.id for s in obj.sections.all()]
        if not section_ids:
            return 0
        from academics.models import StudentProfile
        from django.db.models import Q
        return StudentProfile.objects.filter(
            Q(section_id__in=section_ids) | Q(section_assignments__section_id__in=section_ids, section_assignments__end_date__isnull=True),
            status='ACTIVE'
        ).distinct().count()

