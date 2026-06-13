from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0027_clear_autogen_form_names'),
    ]

    operations = [
        migrations.AddField(
            model_name='feedbackform',
            name='faculty_name',
            field=models.CharField(blank=True, default='', help_text='Faculty name for open/common feedback', max_length=255),
        ),
        migrations.AddField(
            model_name='feedbackform',
            name='section_wise',
            field=models.BooleanField(default=False, help_text='If True, feedback will collect section-wise staff mappings'),
        ),
        migrations.AddField(
            model_name='feedbackform',
            name='section_staff_assignments',
            field=models.JSONField(blank=True, default=list, help_text='Section-wise staff name mappings for feedback forms'),
        ),
    ]
