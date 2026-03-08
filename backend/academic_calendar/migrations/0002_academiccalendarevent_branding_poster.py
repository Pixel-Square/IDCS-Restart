# Generated manually for branding poster fields on AcademicCalendarEvent

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_calendar', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='academiccalendarevent',
            name='branding_poster_status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('generating', 'Generating'),
                    ('ready', 'Ready'),
                    ('failed', 'Failed'),
                ],
                default='pending',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='academiccalendarevent',
            name='branding_poster_url',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='academiccalendarevent',
            name='branding_poster_design_id',
            field=models.CharField(blank=True, max_length=256),
        ),
        migrations.AddField(
            model_name='academiccalendarevent',
            name='branding_poster_preview',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='academiccalendarevent',
            name='branding_data',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
