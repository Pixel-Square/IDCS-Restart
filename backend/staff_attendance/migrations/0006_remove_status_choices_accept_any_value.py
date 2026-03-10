# Generated manually to remove choices constraint from status field
# Allows dynamic status codes from leave templates (CL, ML, COL, OD, etc.)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff_attendance', '0005_add_od_leave_late_status_choices'),
    ]

    operations = [
        migrations.AlterField(
            model_name='attendancerecord',
            name='status',
            field=models.CharField(
                default='absent',
                max_length=20,
                help_text='Attendance status code - can be any value from leave templates'
            ),
        ),
    ]
