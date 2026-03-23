from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0018_feedbackresponse_add_selected_option_text_column'),
    ]

    operations = [
        migrations.AddField(
            model_name='feedbackform',
            name='common_comment_enabled',
            field=models.BooleanField(
                default=False,
                help_text='If True, collect one common comment per subject (or form) instead of per-question comments.',
            ),
        ),
        migrations.AddField(
            model_name='feedbackresponse',
            name='common_comment',
            field=models.TextField(
                blank=True,
                null=True,
                help_text='Subject-level/common comment (stored per response row for compatibility).',
            ),
        ),
    ]
