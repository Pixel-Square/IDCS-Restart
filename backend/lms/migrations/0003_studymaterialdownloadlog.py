from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0072_merge_20260322_0001'),
        ('lms', '0002_seed_lms_permissions'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='StudyMaterialDownloadLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('client_ip', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('downloaded_at', models.DateTimeField(auto_now_add=True)),
                ('downloaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lms_download_logs', to=settings.AUTH_USER_MODEL)),
                ('downloaded_by_staff', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lms_download_logs', to='academics.staffprofile')),
                ('downloaded_by_student', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lms_download_logs', to='academics.studentprofile')),
                ('material', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='download_logs', to='lms.studymaterial')),
            ],
            options={
                'ordering': ('-downloaded_at',),
            },
        ),
        migrations.AddIndex(
            model_name='studymaterialdownloadlog',
            index=models.Index(fields=['material', '-downloaded_at'], name='lms_studyma_materia_d8ae69_idx'),
        ),
        migrations.AddIndex(
            model_name='studymaterialdownloadlog',
            index=models.Index(fields=['downloaded_by', '-downloaded_at'], name='lms_studyma_downloa_e0d86a_idx'),
        ),
    ]
