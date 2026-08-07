from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0040_acv2internalmark_co6_total_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='acv2semestergroup',
            name='faculty_edit_enabled',
            field=models.BooleanField(default=True),
        ),
    ]
