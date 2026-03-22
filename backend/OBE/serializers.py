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
