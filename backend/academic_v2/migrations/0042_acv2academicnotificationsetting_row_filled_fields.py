from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0041_acv2googlesheetlink'),
        ('academic_v2', '0041_acv2semestergroup_faculty_edit_enabled'),
    ]

    operations = [
        migrations.AddField(
            model_name='acv2academicnotificationsetting',
            name='notify_on_row_filled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='acv2academicnotificationsetting',
            name='row_filled_template',
            field=models.TextField(default=(
                '📝 {course_code} - {course_name}\n'
                '{exam_name} marks row was filled by {faculty_name}.\n'
                'Student: {student_name} ({register_number})\n'
                'Mark: {mark}/{max_mark}'
            )),
        ),
    ]
