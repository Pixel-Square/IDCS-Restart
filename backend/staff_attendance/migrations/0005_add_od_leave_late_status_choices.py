# Generated manually to add OD, LEAVE, LATE status choices to AttendanceRecord

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff_attendance', '0004_change_halfdayrequest_to_date_based'),
    ]

    operations = [
        migrations.AlterField(
            model_name='attendancerecord',
            name='status',
            field=models.CharField(
                choices=[
                    ('present', 'Present'),
                    ('absent', 'Absent'),
                    ('half_day', 'Half Day'),
                    ('partial', 'Partial'),
                    ('OD', 'On Duty'),
                    ('LEAVE', 'Leave'),
                    ('LATE', 'Late'),
                ],
                default='absent',
                max_length=20
            ),
        ),
    ]
