# Generated migration for attendance settings and holiday enhancements

from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('staff_attendance', '0006_remove_status_choices_accept_any_value'),
    ]

    operations = [
        # Add field to Holiday model to track if it's a system-generated Sunday
        migrations.AddField(
            model_name='holiday',
            name='is_sunday',
            field=models.BooleanField(default=False, help_text='True if this is an auto-generated Sunday holiday'),
        ),
        
        # Add field to track if holiday can be removed
        migrations.AddField(
            model_name='holiday',
            name='is_removable',
            field=models.BooleanField(default=True, help_text='If False, this holiday cannot be deleted'),
        ),
        
        # Create AttendanceSettings model
        migrations.CreateModel(
            name='AttendanceSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('attendance_in_time_limit', models.TimeField(default='08:45:00', help_text='If morning_in is after this time, mark as absent')),
                ('attendance_out_time_limit', models.TimeField(default='17:45:00', help_text='If evening_out is before this time, mark as absent')),
                ('apply_time_based_absence', models.BooleanField(default=True, help_text='Enable time-based absence marking')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_attendance_settings', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'staff_attendance_settings',
                'verbose_name': 'Attendance Settings',
                'verbose_name_plural': 'Attendance Settings',
            },
        ),
    ]
