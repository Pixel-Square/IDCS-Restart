from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import lms.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('academics', '0072_merge_20260322_0001'),
        ('curriculum', '0022_add_is_dept_core'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='StudyMaterial',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('material_type', models.CharField(choices=[('FILE', 'File'), ('LINK', 'Link')], max_length=8)),
                ('file', models.FileField(blank=True, null=True, upload_to=lms.models._material_upload_path)),
                ('file_size_bytes', models.BigIntegerField(default=0)),
                ('external_url', models.URLField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='study_materials', to='academics.course')),
                ('curriculum_row', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='study_materials', to='curriculum.curriculumdepartment')),
                ('elective_subject', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='study_materials', to='curriculum.electivesubject')),
                ('teaching_assignment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='study_materials', to='academics.teachingassignment')),
                ('uploaded_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='study_materials', to='academics.staffprofile')),
            ],
            options={
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='StaffStorageQuota',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quota_bytes', models.BigIntegerField(default=2147483648)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('staff', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='lms_quota', to='academics.staffprofile')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_lms_quotas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Staff LMS Quota',
                'verbose_name_plural': 'Staff LMS Quotas',
            },
        ),
        migrations.AddIndex(
            model_name='studymaterial',
            index=models.Index(fields=['course', '-created_at'], name='lms_studyma_course__f60a52_idx'),
        ),
        migrations.AddIndex(
            model_name='studymaterial',
            index=models.Index(fields=['uploaded_by', '-created_at'], name='lms_studyma_uploade_1aa91f_idx'),
        ),
    ]
