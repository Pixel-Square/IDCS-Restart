from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lms', '0005_backfill_original_file_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='studymaterial',
            name='co_title',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='studymaterial',
            name='sub_topic',
            field=models.CharField(blank=True, default='ALL', max_length=255),
        ),
    ]
