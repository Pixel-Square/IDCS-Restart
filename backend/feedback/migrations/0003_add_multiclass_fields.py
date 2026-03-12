# Generated migration for multi-class selection

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0002_feedbackform_all_classes_feedbackform_regulation_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='feedbackform',
            name='years',
            field=models.JSONField(blank=True, default=list, help_text='List of years (e.g., [1, 2, 3]) for multi-class feedback'),
        ),
        migrations.AddField(
            model_name='feedbackform',
            name='semesters',
            field=models.JSONField(blank=True, default=list, help_text='List of semester IDs for multi-class feedback'),
        ),
        migrations.AddField(
            model_name='feedbackform',
            name='sections',
            field=models.JSONField(blank=True, default=list, help_text='List of section IDs for multi-class feedback'),
        ),
    ]
