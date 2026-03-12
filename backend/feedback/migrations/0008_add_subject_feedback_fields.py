# Generated manually for subject feedback enhancement

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0007_add_allow_rating_and_comment_fields'),
        ('curriculum', '0001_initial'),
        ('academics', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='feedbackresponse',
            name='subject',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='feedback_responses',
                to='curriculum.curriculumdepartment',
                help_text='Subject this feedback is about (for subject feedback type)',
            ),
        ),
        migrations.AddField(
            model_name='feedbackresponse',
            name='staff',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='feedback_responses_about',
                to='academics.staffprofile',
                help_text='Staff member this feedback is about (for subject feedback type)',
            ),
        ),
        migrations.AddField(
            model_name='feedbackresponse',
            name='teaching_assignment',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='feedback_responses',
                to='academics.teachingassignment',
                help_text='Teaching assignment this feedback relates to',
            ),
        ),
        # Update unique_together to include subject and staff for subject feedback
        migrations.AlterUniqueTogether(
            name='feedbackresponse',
            unique_together={('feedback_form', 'question', 'user', 'teaching_assignment')},
        ),
    ]
