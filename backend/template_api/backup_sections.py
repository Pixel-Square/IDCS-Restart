from backups_logs.registry import BackupSection
from .models import (
    CanvaServiceToken,
    CanvaOAuthState,
    CanvaTemplate,
    EventPosterAttachment,
    BrandingEventLog,
)


class TemplateApiBackupSection(BackupSection):
    """
    Backup section for the Template API module.

    RAW-ONLY: Stores Canva API integration state and user posters.

    Note: EventPosterAttachment contains FileField references to media
    files on disk. This backup routine only serializes the DB metadata
    (the paths), not the actual binary poster files in MEDIA_ROOT.

    Restore strategy: wipe-and-replace.
    """
    section_id = "template_api"
    display_name = "Template API"

    def get_raw_queryset_map(self):
        return {
            CanvaServiceToken: CanvaServiceToken.objects.all(),
            CanvaOAuthState: CanvaOAuthState.objects.all(),
            CanvaTemplate: CanvaTemplate.objects.all(),
            EventPosterAttachment: EventPosterAttachment.objects.all(),
            BrandingEventLog: BrandingEventLog.objects.all(),
        }

    def get_config_queryset_map(self):
        return {}

    def restore_raw(self, data):
        from django.core import serializers
        BrandingEventLog.objects.all().delete()
        EventPosterAttachment.objects.all().delete()
        CanvaTemplate.objects.all().delete()
        CanvaOAuthState.objects.all().delete()
        CanvaServiceToken.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        raise NotImplementedError("template_api is a raw-only section with no config models.")
