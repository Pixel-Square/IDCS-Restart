from backups_logs.registry import BackupSection
from .models import (
    ObeCqiConfig,
    InternalMarkMapping,
    ObeDueSchedule,
    ObeAssessmentControl,
    ObeAssessmentMasterConfig,
    CdapActiveLearningAnalysisMapping,
    CdapRevision,
    LcaRevision,
    CoTargetRevision,
    ObeCqiDraft,
    ObeCqiPublished,
    FinalInternalMark,
    Cia1Mark,
    Cia2Mark,
    Ssa1Mark,
    Ssa2Mark,
    Review1Mark,
    Review2Mark,
    Formative1Mark,
    Formative2Mark,
    AssessmentDraft,
    Cia1PublishedSheet,
    Cia2PublishedSheet,
    ModelPublishedSheet,
    LabPublishedSheet,
    ObePublishRequest,
)


class ObeBackupSection(BackupSection):
    """
    Backup section for the OBE (Outcome Based Education) module.

    CONFIG: ObeCqiConfig, InternalMarkMapping, ObeDueSchedule,
    ObeAssessmentControl, ObeAssessmentMasterConfig,
    CdapActiveLearningAnalysisMapping. These define the parameters
    and timing for the outcome based education evaluation.

    RAW: Revisions, marks, drafts, published sheets, and requests.
    These track the actual evaluations of students and sections.

    Restore strategy: wipe-and-replace.
    """
    section_id = "obe"
    display_name = "OBE"

    def get_raw_queryset_map(self):
        return {
            ObeCqiConfig: ObeCqiConfig.objects.all(),
            InternalMarkMapping: InternalMarkMapping.objects.all(),
            ObeDueSchedule: ObeDueSchedule.objects.all(),
            ObeAssessmentControl: ObeAssessmentControl.objects.all(),
            ObeAssessmentMasterConfig: ObeAssessmentMasterConfig.objects.all(),
            CdapActiveLearningAnalysisMapping: CdapActiveLearningAnalysisMapping.objects.all(),
            CdapRevision: CdapRevision.objects.all(),
            LcaRevision: LcaRevision.objects.all(),
            CoTargetRevision: CoTargetRevision.objects.all(),
            ObeCqiDraft: ObeCqiDraft.objects.all(),
            ObeCqiPublished: ObeCqiPublished.objects.all(),
            FinalInternalMark: FinalInternalMark.objects.all(),
            Cia1Mark: Cia1Mark.objects.all(),
            Cia2Mark: Cia2Mark.objects.all(),
            Ssa1Mark: Ssa1Mark.objects.all(),
            Ssa2Mark: Ssa2Mark.objects.all(),
            Review1Mark: Review1Mark.objects.all(),
            Review2Mark: Review2Mark.objects.all(),
            Formative1Mark: Formative1Mark.objects.all(),
            Formative2Mark: Formative2Mark.objects.all(),
            AssessmentDraft: AssessmentDraft.objects.all(),
            Cia1PublishedSheet: Cia1PublishedSheet.objects.all(),
            Cia2PublishedSheet: Cia2PublishedSheet.objects.all(),
            ModelPublishedSheet: ModelPublishedSheet.objects.all(),
            LabPublishedSheet: LabPublishedSheet.objects.all(),
            ObePublishRequest: ObePublishRequest.objects.all(),
        }

    def get_config_queryset_map(self):
        return {
            ObeCqiConfig: ObeCqiConfig.objects.all(),
            InternalMarkMapping: InternalMarkMapping.objects.all(),
            ObeDueSchedule: ObeDueSchedule.objects.all(),
            ObeAssessmentControl: ObeAssessmentControl.objects.all(),
            ObeAssessmentMasterConfig: ObeAssessmentMasterConfig.objects.all(),
            CdapActiveLearningAnalysisMapping: CdapActiveLearningAnalysisMapping.objects.all(),
        }

    def restore_raw(self, data):
        from django.core import serializers
        ObePublishRequest.objects.all().delete()
        LabPublishedSheet.objects.all().delete()
        ModelPublishedSheet.objects.all().delete()
        Cia2PublishedSheet.objects.all().delete()
        Cia1PublishedSheet.objects.all().delete()
        AssessmentDraft.objects.all().delete()
        Formative2Mark.objects.all().delete()
        Formative1Mark.objects.all().delete()
        Review2Mark.objects.all().delete()
        Review1Mark.objects.all().delete()
        Ssa2Mark.objects.all().delete()
        Ssa1Mark.objects.all().delete()
        Cia2Mark.objects.all().delete()
        Cia1Mark.objects.all().delete()
        FinalInternalMark.objects.all().delete()
        ObeCqiPublished.objects.all().delete()
        ObeCqiDraft.objects.all().delete()
        CoTargetRevision.objects.all().delete()
        LcaRevision.objects.all().delete()
        CdapRevision.objects.all().delete()
        CdapActiveLearningAnalysisMapping.objects.all().delete()
        ObeAssessmentMasterConfig.objects.all().delete()
        ObeAssessmentControl.objects.all().delete()
        ObeDueSchedule.objects.all().delete()
        InternalMarkMapping.objects.all().delete()
        ObeCqiConfig.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        from django.core import serializers
        deserialized = list(serializers.deserialize('json', data))

        imported_pks = {
            ObeCqiConfig: set(),
            InternalMarkMapping: set(),
            ObeDueSchedule: set(),
            ObeAssessmentControl: set(),
            ObeAssessmentMasterConfig: set(),
            CdapActiveLearningAnalysisMapping: set(),
        }

        for des_obj in deserialized:
            model_class = des_obj.object.__class__
            if model_class in imported_pks:
                imported_pks[model_class].add(str(des_obj.object.pk))

        # Delete existing in reverse dep order
        for obj in CdapActiveLearningAnalysisMapping.objects.all():
            if str(obj.pk) not in imported_pks[CdapActiveLearningAnalysisMapping]:
                obj.delete()
        for obj in ObeAssessmentMasterConfig.objects.all():
            if str(obj.pk) not in imported_pks[ObeAssessmentMasterConfig]:
                obj.delete()
        for obj in ObeAssessmentControl.objects.all():
            if str(obj.pk) not in imported_pks[ObeAssessmentControl]:
                obj.delete()
        for obj in ObeDueSchedule.objects.all():
            if str(obj.pk) not in imported_pks[ObeDueSchedule]:
                obj.delete()
        for obj in InternalMarkMapping.objects.all():
            if str(obj.pk) not in imported_pks[InternalMarkMapping]:
                obj.delete()
        for obj in ObeCqiConfig.objects.all():
            if str(obj.pk) not in imported_pks[ObeCqiConfig]:
                obj.delete()

        for des_obj in deserialized:
            des_obj.save()
