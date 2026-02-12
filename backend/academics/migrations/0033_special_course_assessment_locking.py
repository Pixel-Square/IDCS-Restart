from django.db import migrations, models
from django.conf import settings
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0032_add_teachingassignment_enabled_assessments_back'),
        ('curriculum', '0006_special_courses_enabled_assessments'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SpecialCourseAssessmentSelection',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled_assessments', models.JSONField(blank=True, default=list)),
                ('locked', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('academic_year', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='special_assessment_selections', to='academics.academicyear')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_special_assessment_selections', to='academics.staffprofile')),
                ('curriculum_row', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='special_assessment_selections', to='curriculum.curriculumdepartment')),
            ],
            options={
                'verbose_name': 'Special Course Assessment Selection',
                'verbose_name_plural': 'Special Course Assessment Selections',
                'unique_together': {('curriculum_row', 'academic_year')},
            },
        ),
        migrations.CreateModel(
            name='SpecialCourseAssessmentEditRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')], default='PENDING', max_length=16)),
                ('requested_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('can_edit_until', models.DateTimeField(blank=True, null=True)),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('requested_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='special_assessment_edit_requests', to='academics.staffprofile')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_special_assessment_edit_requests', to=settings.AUTH_USER_MODEL)),
                ('selection', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='edit_requests', to='academics.specialcourseassessmentselection')),
            ],
            options={
                'verbose_name': 'Special Course Assessment Edit Request',
                'verbose_name_plural': 'Special Course Assessment Edit Requests',
            },
        ),
        migrations.AddIndex(
            model_name='specialcourseassessmenteditrequest',
            index=models.Index(fields=['status', 'requested_at'], name='academics_s_status_0dfe08_idx'),
        ),
    ]
