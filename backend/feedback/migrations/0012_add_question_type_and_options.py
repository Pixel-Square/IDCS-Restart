# Generated manually on 2026-03-15

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0011_feedbackformsubmission'),
    ]

    operations = [
        migrations.AddField(
            model_name='feedbackquestion',
            name='question_type',
            field=models.CharField(
                choices=[('rating', 'Rating'), ('rating_radio_comment', 'Rating + Radio + Comment')],
                default='rating',
                help_text='Question rendering/validation type. Defaults to rating for backward compatibility.',
                max_length=32,
            ),
        ),
        migrations.CreateModel(
            name='FeedbackQuestionOption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('option_text', models.CharField(help_text='Option label', max_length=255)),
                ('question', models.ForeignKey(help_text='Question this option belongs to', on_delete=django.db.models.deletion.CASCADE, related_name='options', to='feedback.feedbackquestion')),
            ],
            options={
                'verbose_name': 'Feedback Question Option',
                'verbose_name_plural': 'Feedback Question Options',
                'db_table': 'feedback_question_options',
                'ordering': ['id'],
            },
        ),
        migrations.AddField(
            model_name='feedbackresponse',
            name='selected_option',
            field=models.ForeignKey(
                blank=True,
                help_text='Selected radio option (for rating_radio_comment questions)',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='responses',
                to='feedback.feedbackquestionoption',
            ),
        ),
    ]
