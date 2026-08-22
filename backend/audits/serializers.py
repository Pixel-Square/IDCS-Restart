from rest_framework import serializers

from .models import AuditATR, AuditCycle, AuditDepartmentAssignment, AuditQuestion, AuditQuestionSet, AuditRubric, AuditScore


class AuditCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditCycle
        fields = ('id', 'cycle', 'name', 'label', 'is_active')


class AuditQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditQuestion
        fields = ('id', 'sl_no', 'details', 'documents_checklist',
                  'detailed_description', 'max_marks', 'is_active')


class AuditQuestionSetSerializer(serializers.ModelSerializer):
    question_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=AuditQuestion.objects.filter(is_active=True),
        source='questions',
        required=False,
    )
    question_count = serializers.SerializerMethodField()
    questions_detail = AuditQuestionSerializer(many=True, source='questions', read_only=True)

    class Meta:
        model = AuditQuestionSet
        fields = ('id', 'name', 'description', 'question_ids', 'question_count', 'questions_detail',
                  'is_active', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at', 'question_count', 'questions_detail')

    def get_question_count(self, obj):
        return obj.questions.count()


class AuditRubricSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditRubric
        fields = ('id', 'name', 'file', 'file_url', 'uploaded_by', 'uploaded_by_name', 'uploaded_at', 'is_active')
        read_only_fields = ('uploaded_by', 'uploaded_at', 'file_url', 'uploaded_by_name')

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f'{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}'.strip() or obj.uploaded_by.username
        return ''


class AuditScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditScore
        fields = ('id', 'question', 'marks', 'comments', 'updated_by', 'updated_at')
        read_only_fields = ('updated_by', 'updated_at')


class AuditATRSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditATR
        fields = ('id', 'question', 'action_taken', 'status', 'submitted_by', 'submitted_at')
        read_only_fields = ('submitted_by', 'submitted_at')


class AuditorBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    staff_id = serializers.CharField()
    name = serializers.SerializerMethodField()
    designation = serializers.CharField(allow_blank=True)
    department = serializers.SerializerMethodField()

    def get_name(self, obj):
        user = getattr(obj, 'user', None)
        if user:
            return f'{user.first_name} {user.last_name}'.strip() or user.username
        return obj.staff_id or ''

    def get_department(self, obj):
        dept = getattr(obj, 'current_department', None) or getattr(obj, 'department', None)
        if not dept:
            return None
        return {
            'id': dept.id,
            'code': dept.code,
            'name': dept.name,
            'short_name': dept.short_name,
        }


class AuditAssignmentSerializer(serializers.ModelSerializer):
    auditors = AuditorBriefSerializer(many=True, read_only=True)
    cycle_label = serializers.CharField(source='cycle.label', read_only=True)
    cycle_number = serializers.IntegerField(source='cycle.cycle', read_only=True)
    department_code = serializers.CharField(source='department.code', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    department_short_name = serializers.CharField(source='department.short_name', read_only=True)
    question_set_id = serializers.IntegerField(source='question_set.id', read_only=True, allow_null=True)
    question_set_name = serializers.CharField(source='question_set.name', read_only=True, allow_null=True)

    class Meta:
        model = AuditDepartmentAssignment
        fields = (
            'id', 'cycle', 'cycle_number', 'cycle_label',
            'department', 'department_code', 'department_name', 'department_short_name',
            'auditors', 'assigned_by', 'status', 'remarks',
            'question_set_id', 'question_set_name',
            'created_at', 'updated_at',
        )
        read_only_fields = ('assigned_by',)


class AuditAssignmentCreateSerializer(serializers.Serializer):
    cycle_id = serializers.IntegerField()
    department_id = serializers.IntegerField()
    auditor_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')
    question_set_id = serializers.IntegerField(required=False, allow_null=True)


class ScoreEntrySerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    marks = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    comments = serializers.CharField(required=False, allow_blank=True)


class ATREntrySerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    action_taken = serializers.CharField(required=False, allow_blank=True)
