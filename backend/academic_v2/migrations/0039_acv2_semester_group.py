from django.conf import settings
from django.db import migrations, models
import uuid

class Migration(migrations.Migration):

    initial = False

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('academic_v2', '0038_course_outcome'),
    ]

    operations = [
        migrations.CreateModel(
            name='AcV2SemesterGroup',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=120)),
                ('description', models.TextField(blank=True)),
                ('publish_control_enabled', models.BooleanField(default=True)),
                ('approval_workflow', models.JSONField(blank=True, default=list)),
                ('approval_window_minutes', models.IntegerField(default=120)),
                ('edit_request_validity_hours', models.IntegerField(default=24)),
                ('approval_until_publish', models.BooleanField(default=False)),
                ('open_from', models.DateTimeField(blank=True, null=True)),
                ('due_at', models.DateTimeField(blank=True, null=True)),
                ('auto_publish_on_due', models.BooleanField(default=True)),
                ('seal_animation_enabled', models.BooleanField(default=False)),
                ('seal_watermark_enabled', models.BooleanField(default=False)),
                ('seal_image', models.ImageField(blank=True, null=True, upload_to='academic_v2/seals/')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='acv2_semester_groups_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'acv2_semester_group',
                'verbose_name': 'Semester Group',
                'verbose_name_plural': 'Semester Groups',
            },
        ),
        migrations.CreateModel(
            name='AcV2SemesterGroupMembership',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('group', models.ForeignKey(on_delete=models.CASCADE, related_name='members', to='academic_v2.acv2semestergroup')),
                ('semester', models.OneToOneField(on_delete=models.CASCADE, related_name='acv2_semester_group', to='academics.semester')),
            ],
            options={
                'db_table': 'acv2_semester_group_membership',
                'verbose_name': 'Semester Group Membership',
                'verbose_name_plural': 'Semester Group Memberships',
            },
        ),
    ]
