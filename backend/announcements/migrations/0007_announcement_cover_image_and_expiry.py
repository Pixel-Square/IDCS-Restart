from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('announcements', '0006_backfill_read_status_and_remove_legacy_read'),
    ]

    operations = [
        migrations.AddField(
            model_name='announcement',
            name='cover_image',
            field=models.ImageField(blank=True, null=True, upload_to='announcements/covers/'),
        ),
        migrations.AddField(
            model_name='announcement',
            name='expiry_date',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='announcement',
            index=models.Index(fields=['expiry_date'], name='announce_expiry_idx'),
        ),
    ]
