# Generated manually on 2026-03-10

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0006_alter_feedbackresponse_unique_together_and_more'),
    ]

    operations = [
        # Add new fields
        migrations.AddField(
            model_name='feedbackquestion',
            name='allow_rating',
            field=models.BooleanField(default=True, help_text='Allow star rating (1-5) for this question'),
        ),
        migrations.AddField(
            model_name='feedbackquestion',
            name='allow_comment',
            field=models.BooleanField(default=True, help_text='Allow text comment for this question'),
        ),
        # Update answer_type field to include new choice and change default
        migrations.AlterField(
            model_name='feedbackquestion',
            name='answer_type',
            field=models.CharField(
                choices=[('STAR', 'Star Rating'), ('TEXT', 'Text Response'), ('BOTH', 'Star Rating and Text')],
                default='BOTH',
                help_text='Type of answer: star rating, text, or both (legacy field)',
                max_length=10
            ),
        ),
    ]
