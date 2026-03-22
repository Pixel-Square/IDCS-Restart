from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0010_feedbackform_is_subject_based'),
    ]

    operations = [
        migrations.CreateModel(
            name='FeedbackFormSubmission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('submission_status', models.CharField(choices=[('PENDING', 'Pending'), ('SUBMITTED', 'Submitted')], default='PENDING', max_length=10)),
                ('total_subjects', models.PositiveIntegerField(default=0)),
                ('responded_subjects', models.PositiveIntegerField(default=0)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('feedback_form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submission_statuses', to='feedback.feedbackform')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='feedback_form_submissions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'feedback_form_submissions',
                'unique_together': {('feedback_form', 'user')},
            },
        ),
    ]
