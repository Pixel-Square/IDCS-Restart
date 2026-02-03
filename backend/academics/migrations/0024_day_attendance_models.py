from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0023_remove_attendance_models'),
    ]

    operations = [
        migrations.CreateModel(
            name='DayAttendanceSession',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('is_locked', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('section', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='day_attendance_sessions', to='academics.section')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='academics.staffprofile')),
            ],
            options={
                'unique_together': {('section', 'date')},
            },
        ),
        migrations.CreateModel(
            name='DayAttendanceRecord',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('P', 'Present'), ('A', 'Absent'), ('OD', 'On Duty'), ('LATE', 'Late'), ('LEAVE', 'Leave')], max_length=8)),
                ('marked_at', models.DateTimeField(auto_now=True)),
                ('marked_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='academics.staffprofile')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='records', to='academics.dayattendancesession')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='day_attendance_records', to='academics.studentprofile')),
            ],
            options={
                'unique_together': {('session', 'student')},
            },
        ),
    ]
