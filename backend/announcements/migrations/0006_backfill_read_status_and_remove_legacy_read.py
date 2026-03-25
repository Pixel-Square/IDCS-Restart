from django.db import migrations


def copy_legacy_reads_to_status(apps, schema_editor):
    AnnouncementRead = apps.get_model('announcements', 'AnnouncementRead')
    AnnouncementReadStatus = apps.get_model('announcements', 'AnnouncementReadStatus')
    db_alias = schema_editor.connection.alias

    for legacy in AnnouncementRead.objects.using(db_alias).all().iterator():
        AnnouncementReadStatus.objects.using(db_alias).update_or_create(
            user_id=legacy.user_id,
            announcement_id=legacy.announcement_id,
            defaults={
                'is_read': True,
                'read_at': legacy.read_at,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('announcements', '0005_remove_announcement_announcemen_source_ad59ff_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(copy_legacy_reads_to_status, migrations.RunPython.noop),
        migrations.DeleteModel(
            name='AnnouncementRead',
        ),
    ]
