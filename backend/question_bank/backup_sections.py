from backups_logs.registry import BackupSection
from .models import QuestionBankTitle, QuestionBankQuestion


class QuestionBankBackupSection(BackupSection):
    """
    Backup section for the Question Bank module.

    RAW-ONLY: Both models (QuestionBankTitle, QuestionBankQuestion) are
    user-created content. No structural settings or template models exist.

    Restore strategy: wipe-and-replace — delete all records then restore
    from snapshot. QuestionBankQuestion has FK to QuestionBankTitle
    (SET_NULL), so we delete questions first to avoid orphan issues,
    then titles.
    """
    section_id = "question_bank"
    display_name = "Question Bank"

    def get_raw_queryset_map(self):
        return {
            QuestionBankTitle: QuestionBankTitle.objects.all(),
            QuestionBankQuestion: QuestionBankQuestion.objects.all(),
        }

    def get_config_queryset_map(self):
        return {}

    def restore_raw(self, data):
        from django.core import serializers
        # Delete children first (FK: Question → Title)
        QuestionBankQuestion.objects.all().delete()
        QuestionBankTitle.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        raise NotImplementedError("question_bank is a raw-only section with no config models.")
