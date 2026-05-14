from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('academic_calendar', '0005_add_calendar_event_label_and_assignment'),
    ]

    operations = [
        migrations.CreateModel(
            name='AcademicCalendar',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=255)),
                ('from_date', models.DateField()),
                ('to_date', models.DateField()),
                ('academic_year', models.CharField(max_length=16)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='academic_calendars', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-from_date', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AcademicCalendarDay',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('day_name', models.CharField(max_length=16)),
                ('working_days', models.CharField(blank=True, max_length=64)),
                ('ii_year', models.CharField(blank=True, max_length=64)),
                ('iii_year', models.CharField(blank=True, max_length=64)),
                ('iv_year', models.CharField(blank=True, max_length=64)),
                ('i_year', models.CharField(blank=True, max_length=64)),
                ('calendar', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='days', to='academic_calendar.academiccalendar')),
            ],
            options={
                'ordering': ['date'],
                'unique_together': {('calendar', 'date')},
            },
        ),
        migrations.CreateModel(
            name='AcademicCalendarHoliday',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('name', models.CharField(max_length=200)),
                ('source', models.CharField(default='working_days', max_length=32)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('calendar', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='holidays', to='academic_calendar.academiccalendar')),
            ],
            options={
                'ordering': ['date'],
                'unique_together': {('calendar', 'date', 'name')},
            },
        ),
        migrations.AddIndex(
            model_name='academiccalendar',
            index=models.Index(fields=['from_date'], name='academic_ca_from_da_45d2fe_idx'),
        ),
        migrations.AddIndex(
            model_name='academiccalendar',
            index=models.Index(fields=['to_date'], name='academic_ca_to_dat_2d7a0f_idx'),
        ),
        migrations.AddIndex(
            model_name='academiccalendarday',
            index=models.Index(fields=['calendar', 'date'], name='academic_ca_calendar_9f2cd9_idx'),
        ),
        migrations.AddIndex(
            model_name='academiccalendarholiday',
            index=models.Index(fields=['calendar', 'date'], name='academic_ca_calendar_d35f4c_idx'),
        ),
    ]
