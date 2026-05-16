from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0025_cqi_token_operator'),
    ]

    operations = [
        migrations.CreateModel(
            name='AcV2AcademicNotificationSetting',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('key', models.CharField(max_length=40, default='DEFAULT', unique=True)),

                ('student_publish_enabled', models.BooleanField(default=False)),
                ('notify_on_first_publish', models.BooleanField(default=True)),
                ('notify_on_row_edits_only', models.BooleanField(default=True)),
                ('notify_on_every_publish_click', models.BooleanField(default=False)),

                ('first_publish_template', models.TextField(default=(
                    '✅ {course_code} - {course_name}\n'
                    '{exam_name} marks are published by {faculty_name}.\n'
                    'Student: {student_name} ({register_number})\n'
                    'Mark: {mark}/{max_mark}'
                ))),
                ('edited_rows_template', models.TextField(default=(
                    '✏️ {course_code} - {course_name}\n'
                    '{exam_name} marks were updated by {faculty_name}.\n'
                    'Student: {student_name} ({register_number})\n'
                    'Updated Mark: {mark}/{max_mark}'
                ))),
                ('every_publish_template', models.TextField(default=(
                    '📢 {course_code} - {course_name}\n'
                    '{exam_name} marks publish action completed by {faculty_name}.\n'
                    'Student: {student_name} ({register_number})\n'
                    'Mark: {mark}/{max_mark}'
                ))),

                ('cqi_announce_enabled', models.BooleanField(default=False)),
                ('cqi_announce_template', models.TextField(default=(
                    '📣 CQI Announced\n'
                    '{course_code} - {course_name}\n'
                    'Faculty: {faculty_name}\n'
                    'CO Attainments: {co_attainments}\n'
                    'Satisfied Conditions: {satisfied_conditions}'
                ))),

                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'acv2_academic_notification_setting',
                'verbose_name': 'Academic Notification Setting',
                'verbose_name_plural': 'Academic Notification Settings',
            },
        ),
    ]
