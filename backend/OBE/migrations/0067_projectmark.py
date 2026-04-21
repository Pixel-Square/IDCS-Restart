from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0088_staffprofile_personal_email'),
        ('OBE', '0066_backfill_model_exam_marks_from_published_v2'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectMark',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mark', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_marks', to='academics.studentprofile')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_marks', to='academics.subject')),
                ('teaching_assignment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='project_marks', to='academics.teachingassignment')),
            ],
        ),
        migrations.AddConstraint(
            model_name='projectmark',
            constraint=models.UniqueConstraint(
                condition=Q(('teaching_assignment__isnull', False)),
                fields=('subject', 'student', 'teaching_assignment'),
                name='unique_project_mark_subject_student_ta',
            ),
        ),
        migrations.AddConstraint(
            model_name='projectmark',
            constraint=models.UniqueConstraint(
                condition=Q(('teaching_assignment__isnull', True)),
                fields=('subject', 'student'),
                name='unique_project_mark_subject_student_legacy',
            ),
        ),
    ]
