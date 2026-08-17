from rest_framework import serializers

from .models import (
    AssessmentDraft,
    CdapActiveLearningAnalysisMapping,
    CdapRevision,
    Cia1Mark,
    Cia1PublishedSheet,
    Cia2Mark,
    Cia2PublishedSheet,
    ClassTypeWeights,
    CoTargetRevision,
    CourseQuestionBank,
    CourseQuestionBankLog,
    Formative1Mark,
    Formative2Mark,
    InternalMarkMapping,
    IqacResetNotification,
    LabPublishedSheet,
    LcaRevision,
    ModelPublishedSheet,
    ObeAssessmentControl,
    ObeAssessmentMasterConfig,
    ObeCqiConfig,
    ObeCqiDraft,
    ObeCqiPublished,
    ObeDueSchedule,
    ObeEditNotificationLog,
    ObeEditRequest,
    ObeGlobalPublishControl,
    ObeMarkTableLock,
    ObePublishRequest,
    ObeQpPatternConfig,
    ProjectMark,
    Review1Mark,
    Review2Mark,
    Ssa1Mark,
    Ssa2Mark,
)


class UserFriendlyModelSerializer(serializers.ModelSerializer):
    """ModelSerializer with extra human-friendly fields in response.

    Adds for each model field where possible:
    - `<field>_display`: display label for choice fields
    - `<fk_field>_label`: `str(related_obj)` for FK/O2O fields
    - `<datetime_field>_formatted`: readable datetime string
    """

    def to_representation(self, instance):
        data = super().to_representation(instance)

        for field in instance._meta.fields:
            field_name = getattr(field, 'name', None)
            if not field_name:
                continue

            # Choice labels (status -> status_display)
            if getattr(field, 'choices', None):
                display_method = getattr(instance, f'get_{field_name}_display', None)
                if callable(display_method):
                    try:
                        data[f'{field_name}_display'] = display_method()
                    except Exception:
                        pass

            # Related object string labels (subject_id + subject_label)
            relation_type = field.get_internal_type()
            if relation_type in {'ForeignKey', 'OneToOneField'}:
                try:
                    related_obj = getattr(instance, field_name, None)
                    data[f'{field_name}_label'] = str(related_obj) if related_obj else None
                except Exception:
                    data[f'{field_name}_label'] = None

            # Readable datetime text
            if relation_type == 'DateTimeField':
                try:
                    value = getattr(instance, field_name, None)
                    data[f'{field_name}_formatted'] = value.strftime('%d-%m-%Y %I:%M %p') if value else None
                except Exception:
                    data[f'{field_name}_formatted'] = None

        return data


class CdapRevisionSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = CdapRevision
        fields = '__all__'


class LcaRevisionSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = LcaRevision
        fields = '__all__'


class CoTargetRevisionSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = CoTargetRevision
        fields = '__all__'


class CdapActiveLearningAnalysisMappingSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = CdapActiveLearningAnalysisMapping
        fields = '__all__'


class ObeAssessmentMasterConfigSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeAssessmentMasterConfig
        fields = '__all__'


class ObeCqiConfigSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeCqiConfig
        fields = '__all__'


class ObeCqiDraftSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeCqiDraft
        fields = '__all__'


class ObeCqiPublishedSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeCqiPublished
        fields = '__all__'


class InternalMarkMappingSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = InternalMarkMapping
        fields = '__all__'


class Cia1MarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Cia1Mark
        fields = '__all__'


class AssessmentDraftSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = AssessmentDraft
        fields = '__all__'


class Ssa1MarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Ssa1Mark
        fields = '__all__'


class Ssa2MarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Ssa2Mark
        fields = '__all__'


class Review1MarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Review1Mark
        fields = '__all__'


class Review2MarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Review2Mark
        fields = '__all__'


class ProjectMarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ProjectMark
        fields = '__all__'


class Formative1MarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Formative1Mark
        fields = '__all__'


class Formative2MarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Formative2Mark
        fields = '__all__'


class Cia2MarkSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Cia2Mark
        fields = '__all__'


class Cia1PublishedSheetSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Cia1PublishedSheet
        fields = '__all__'


class Cia2PublishedSheetSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = Cia2PublishedSheet
        fields = '__all__'


class ModelPublishedSheetSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ModelPublishedSheet
        fields = '__all__'


class LabPublishedSheetSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = LabPublishedSheet
        fields = '__all__'


class ObeDueScheduleSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeDueSchedule
        fields = '__all__'


class ObeAssessmentControlSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeAssessmentControl
        fields = '__all__'


class ObePublishRequestSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObePublishRequest
        fields = '__all__'


class CourseQuestionBankSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField(read_only=True)
    finalized_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CourseQuestionBank
        fields = (
            'id', 'course_code', 'course_name', 's_no', 'question_text', 'subtopics', 'question_type',
            'course_outcome', 'part', 'btl', 'marks', 'college', 'is_finalized',
            'created_by', 'created_by_name', 'finalized_by', 'finalized_by_name',
            'created_at', 'updated_at', 'finalized_at'
        )
        read_only_fields = ('created_at', 'updated_at', 'finalized_at')

    def get_created_by_name(self, obj):
        if obj.created_by and obj.created_by.user:
            return f"{obj.created_by.user.first_name} {obj.created_by.user.last_name}".strip() or obj.created_by.user.username
        return ''

    def get_finalized_by_name(self, obj):
        if obj.finalized_by and obj.finalized_by.user:
            return f"{obj.finalized_by.user.first_name} {obj.finalized_by.user.last_name}".strip() or obj.finalized_by.user.username
        return ''


class CourseQuestionBankLogSerializer(serializers.ModelSerializer):
    course_code = serializers.SerializerMethodField(read_only=True)
    edited_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CourseQuestionBankLog
        fields = (
            'id', 'question_bank', 'course_code', 'action', 'edited_by',
            'edited_by_name', 'old_values', 'new_values', 'edited_at'
        )
        read_only_fields = ('edited_at',)

    def get_course_code(self, obj):
        return obj.question_bank.course_code if obj.question_bank else ''

    def get_edited_by_name(self, obj):
        if obj.edited_by and obj.edited_by.user:
            return f"{obj.edited_by.user.first_name} {obj.edited_by.user.last_name}".strip() or obj.edited_by.user.username
        return ''


class ObeEditRequestSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeEditRequest
        fields = '__all__'


class ObeEditNotificationLogSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeEditNotificationLog
        fields = '__all__'


class ObeGlobalPublishControlSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeGlobalPublishControl
        fields = '__all__'


class ObeMarkTableLockSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeMarkTableLock
        fields = '__all__'


class ObeQpPatternConfigSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ObeQpPatternConfig
        fields = '__all__'


class ClassTypeWeightsSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = ClassTypeWeights
        fields = '__all__'


class IqacResetNotificationSerializer(UserFriendlyModelSerializer):
    class Meta:
        model = IqacResetNotification
        fields = '__all__'


OBE_MODEL_SERIALIZER_MAP = {
    CdapRevision: CdapRevisionSerializer,
    LcaRevision: LcaRevisionSerializer,
    CoTargetRevision: CoTargetRevisionSerializer,
    CdapActiveLearningAnalysisMapping: CdapActiveLearningAnalysisMappingSerializer,
    ObeAssessmentMasterConfig: ObeAssessmentMasterConfigSerializer,
    ObeCqiConfig: ObeCqiConfigSerializer,
    ObeCqiDraft: ObeCqiDraftSerializer,
    ObeCqiPublished: ObeCqiPublishedSerializer,
    InternalMarkMapping: InternalMarkMappingSerializer,
    Cia1Mark: Cia1MarkSerializer,
    AssessmentDraft: AssessmentDraftSerializer,
    Ssa1Mark: Ssa1MarkSerializer,
    Ssa2Mark: Ssa2MarkSerializer,
    Review1Mark: Review1MarkSerializer,
    Review2Mark: Review2MarkSerializer,
    ProjectMark: ProjectMarkSerializer,
    Formative1Mark: Formative1MarkSerializer,
    Formative2Mark: Formative2MarkSerializer,
    Cia2Mark: Cia2MarkSerializer,
    Cia1PublishedSheet: Cia1PublishedSheetSerializer,
    Cia2PublishedSheet: Cia2PublishedSheetSerializer,
    ModelPublishedSheet: ModelPublishedSheetSerializer,
    LabPublishedSheet: LabPublishedSheetSerializer,
    ObeDueSchedule: ObeDueScheduleSerializer,
    ObeAssessmentControl: ObeAssessmentControlSerializer,
    ObePublishRequest: ObePublishRequestSerializer,
    ObeEditRequest: ObeEditRequestSerializer,
    ObeEditNotificationLog: ObeEditNotificationLogSerializer,
    ObeGlobalPublishControl: ObeGlobalPublishControlSerializer,
    ObeMarkTableLock: ObeMarkTableLockSerializer,
    ObeQpPatternConfig: ObeQpPatternConfigSerializer,
    ClassTypeWeights: ClassTypeWeightsSerializer,
    IqacResetNotification: IqacResetNotificationSerializer,
}
