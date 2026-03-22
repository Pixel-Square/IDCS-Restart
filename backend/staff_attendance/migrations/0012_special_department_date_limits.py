from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('staff_attendance', '0011_add_department_attendance_settings'),
    ]

    operations = [
        migrations.CreateModel(
            name='SpecialDepartmentDateAttendanceLimit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('description', models.TextField(blank=True)),
                ('from_date', models.DateField()),
                ('to_date', models.DateField(blank=True, help_text='Optional. If empty, applies only to from_date.', null=True)),
                ('attendance_in_time_limit', models.TimeField(default='08:45:00')),
                ('attendance_out_time_limit', models.TimeField(default='17:00:00')),
                ('mid_time_split', models.TimeField(default='13:00:00')),
                ('apply_time_based_absence', models.BooleanField(default=True)),
                ('enabled', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_special_attendance_limits', to=settings.AUTH_USER_MODEL)),
                ('departments', models.ManyToManyField(help_text='Departments using this special date-range attendance limit', related_name='special_date_attendance_limits', to='academics.department')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_special_attendance_limits', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Special Department Date Attendance Limit',
                'verbose_name_plural': 'Special Department Date Attendance Limits',
                'db_table': 'staff_attendance_special_date_limits',
                'ordering': ['-from_date', '-id'],
            },
        ),
    ]
