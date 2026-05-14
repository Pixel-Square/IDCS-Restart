from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0022_class_type_cqi_global_custom_vars'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AcV2BypassSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('teaching_assignment_id', models.IntegerField(blank=True, null=True)),
                ('course_code', models.CharField(blank=True, max_length=64)),
                ('course_name', models.CharField(blank=True, max_length=255)),
                ('section_name', models.CharField(blank=True, max_length=64)),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('ended_at', models.DateTimeField(blank=True, null=True)),
                ('share_token', models.CharField(blank=True, db_index=True, max_length=64)),
                ('share_expires_at', models.DateTimeField(blank=True, null=True)),
                ('admin', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='acv2_bypass_sessions_admin', to=settings.AUTH_USER_MODEL)),
                ('faculty_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='acv2_bypass_sessions_faculty', to=settings.AUTH_USER_MODEL)),
                ('shared_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='acv2_bypass_sessions_shared', to=settings.AUTH_USER_MODEL)),
                ('shared_accessed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='acv2_bypass_sessions_accessed', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Bypass Session',
                'verbose_name_plural': 'Bypass Sessions',
                'db_table': 'acv2_bypass_session',
                'ordering': ['-started_at'],
            },
        ),
        migrations.CreateModel(
            name='AcV2BypassLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('action', models.CharField(choices=[
                    ('ENTER', 'Bypass Entered'),
                    ('EXIT', 'Bypass Exited'),
                    ('RESET_COURSE', 'Course Reset'),
                    ('RESET_EXAM', 'Exam Reset'),
                    ('MESSAGE', 'WhatsApp Message Sent'),
                    ('MARK_EDIT', 'Marks Edited'),
                    ('PUBLISH', 'Exam Published'),
                    ('UNPUBLISH', 'Exam Unpublished'),
                    ('SHARE', 'Bypass Link Shared'),
                    ('SHARE_ACCESSED', 'Shared Bypass Accessed'),
                    ('OTHER', 'Other'),
                ], default='OTHER', max_length=30)),
                ('description', models.TextField(blank=True)),
                ('extra', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='logs', to='academic_v2.acv2bypasssession')),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='acv2_bypass_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Bypass Log',
                'verbose_name_plural': 'Bypass Logs',
                'db_table': 'acv2_bypass_log',
                'ordering': ['created_at'],
            },
        ),
    ]
