from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('staff_attendance', '0013_staffbiometricpunchlog'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='StaffAttendanceTimeLimitOverride',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('attendance_in_time_limit', models.TimeField(default='08:45:00')),
                ('attendance_out_time_limit', models.TimeField(default='17:00:00')),
                ('mid_time_split', models.TimeField(default='13:00:00')),
                ('apply_time_based_absence', models.BooleanField(default=True)),
                ('enabled', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_staff_attendance_time_limit_overrides', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_staff_attendance_time_limit_overrides', to=settings.AUTH_USER_MODEL)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='staff_attendance_time_limit_override', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'staff_attendance_staff_time_limits',
                'verbose_name': 'Staff Attendance Time Limit Override',
                'verbose_name_plural': 'Staff Attendance Time Limit Overrides',
                'ordering': ['-updated_at', '-id'],
            },
        ),
    ]
