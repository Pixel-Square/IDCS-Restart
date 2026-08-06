from backups_logs.registry import BackupSection
from .models import (
    FeedbackForm,
    FeedbackQuestion,
    FeedbackQuestionOption,
    FeedbackResponse,
    FeedbackFormSubmission,
)


class FeedbackBackupSection(BackupSection):
    section_id = "feedback"
    display_name = "Feedback Data"

    def get_raw_queryset_map(self):
        return {
            FeedbackForm: FeedbackForm.objects.all(),
            FeedbackQuestion: FeedbackQuestion.objects.all(),
            FeedbackQuestionOption: FeedbackQuestionOption.objects.all(),
            FeedbackResponse: FeedbackResponse.objects.all(),
            FeedbackFormSubmission: FeedbackFormSubmission.objects.all(),
        }

    def get_config_queryset_map(self):
        return {
            FeedbackForm: FeedbackForm.objects.all(),
            FeedbackQuestion: FeedbackQuestion.objects.all(),
            FeedbackQuestionOption: FeedbackQuestionOption.objects.all(),
        }

    def restore_raw(self, data):
        from django.core import serializers
        
        # 1. Wipe existing raw (in reverse dependency order to avoid FK issues if possible, 
        # though delete cascades generally handle it. It's safer to delete the root which cascades).
        FeedbackForm.objects.all().delete()
        # This cascades and deletes FeedbackQuestion, FeedbackQuestionOption, FeedbackResponse, FeedbackFormSubmission
        
        # 2. Restore
        deserialized = list(serializers.deserialize('json', data))
        for des_obj in deserialized:
            des_obj.save()

    def import_config(self, data):
        from django.core import serializers
        deserialized = list(serializers.deserialize('json', data))
        
        imported_pks = {
            FeedbackForm: set(),
            FeedbackQuestion: set(),
            FeedbackQuestionOption: set()
        }
        
        for des_obj in deserialized:
            model_class = des_obj.object.__class__
            if model_class in imported_pks:
                imported_pks[model_class].add(str(des_obj.object.pk))
                
        # Delete existing config objects NOT in the imported JSON
        # Doing this in reverse dependency order might be necessary, but Django handles cascades.
        # Be aware this cascade-deletes related raw responses.
        for live_obj in FeedbackQuestionOption.objects.all():
            if str(live_obj.pk) not in imported_pks[FeedbackQuestionOption]:
                live_obj.delete()
                
        for live_obj in FeedbackQuestion.objects.all():
            if str(live_obj.pk) not in imported_pks[FeedbackQuestion]:
                live_obj.delete()
                
        for live_obj in FeedbackForm.objects.all():
            if str(live_obj.pk) not in imported_pks[FeedbackForm]:
                live_obj.delete()
                
        # Upsert imported objects
        for des_obj in deserialized:
            des_obj.save()
