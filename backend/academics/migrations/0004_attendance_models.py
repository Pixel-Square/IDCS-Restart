from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0003_teachingassignment'),
    ]

    operations = [
        migrations.CreateModel(
            name='AttendanceSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('period', models.CharField(blank=True, max_length=32, null=True)),
                ('is_locked', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='created_attendance_sessions', to='accounts.user')),
                ('teaching_assignment', models.ForeignKey(on_delete=models.CASCADE, related_name='attendance_sessions', to='academics.teachingassignment')),
            ],
            options={
                'verbose_name': 'Attendance Session',
                'verbose_name_plural': 'Attendance Sessions',
            },
        ),
        migrations.CreateModel(
            name='AttendanceRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('P', 'Present'), ('A', 'Absent')], max_length=1)),
                ('marked_at', models.DateTimeField(auto_now_add=True)),
                ('attendance_session', models.ForeignKey(on_delete=models.CASCADE, related_name='records', to='academics.attendancesession')),
                ('student', models.ForeignKey(on_delete=models.CASCADE, related_name='attendance_records', to='academics.studentprofile')),
            ],
            options={
                'verbose_name': 'Attendance Record',
                'verbose_name_plural': 'Attendance Records',
            },
        ),
        migrations.AddConstraint(
            model_name='attendancesession',
            constraint=models.UniqueConstraint(fields=('teaching_assignment', 'date', 'period'), name='unique_teaching_date_period'),
        ),
        migrations.AddConstraint(
            model_name='attendancerecord',
            constraint=models.UniqueConstraint(fields=('attendance_session', 'student'), name='unique_session_student'),
        ),
    ]
