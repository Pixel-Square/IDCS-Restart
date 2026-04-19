from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0004_acv2editrequest_expires_at_and_more'),
        ('academics', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='AcV2DraftMark',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('reg_no', models.CharField(max_length=50)),
                ('student_name', models.CharField(max_length=255)),
                ('total_mark', models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ('question_marks', models.JSONField(blank=True, default=dict)),
                ('is_absent', models.BooleanField(default=False)),
                ('last_saved_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('exam_assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='draft_marks', to='academic_v2.acv2examassignment')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='acv2_draft_marks', to='academics.studentprofile')),
            ],
            options={
                'verbose_name': 'Draft Mark',
                'verbose_name_plural': 'Draft Marks',
                'db_table': 'acv2_draft_mark',
                'indexes': [models.Index(fields=['exam_assignment', 'reg_no'], name='acv2_draft__exam_as_2eb8ce_idx'), models.Index(fields=['student'], name='acv2_draft__student_c8312f_idx')],
                'constraints': [models.UniqueConstraint(fields=('exam_assignment', 'student'), name='unique_acv2_draft_mark_per_exam')],
            },
        ),
    ]
