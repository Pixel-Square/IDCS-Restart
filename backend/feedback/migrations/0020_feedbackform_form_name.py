# Generated migration for adding form_name field to FeedbackForm

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0019_common_comment_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='feedbackform',
            name='form_name',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Custom name/title for the feedback form',
                max_length=255
            ),
        ),
    ]
