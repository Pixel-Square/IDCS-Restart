# Generated migration for discipline app
from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('academics', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='DisciplineCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(help_text='Category title / violation name', max_length=255)),
                ('description', models.TextField(blank=True, default='', help_text='Guidance, protocol, or details')),
                ('semesters', models.JSONField(default=list, help_text="Applicable semesters e.g. ['SEM 1', 'SEM 2', 'SEM 3', ...]")),
                ('severity', models.CharField(choices=[('LOW', 'Low'), ('MEDIUM', 'Medium'), ('HIGH', 'High'), ('CRITICAL', 'Critical')], default='MEDIUM', max_length=16)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Discipline Category',
                'verbose_name_plural': 'Discipline Categories',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='DisciplineIncidentLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('student_name', models.CharField(blank=True, default='', max_length=255)),
                ('reg_no', models.CharField(db_index=True, max_length=64)),
                ('username', models.CharField(blank=True, default='', max_length=150)),
                ('department_name', models.CharField(blank=True, default='', max_length=150)),
                ('section_name', models.CharField(blank=True, default='', max_length=32)),
                ('batch_name', models.CharField(blank=True, default='', max_length=64)),
                ('category_title', models.CharField(blank=True, default='', max_length=255)),
                ('severity', models.CharField(choices=[('LOW', 'Low'), ('MEDIUM', 'Medium'), ('HIGH', 'High'), ('CRITICAL', 'Critical')], default='MEDIUM', max_length=16)),
                ('status', models.CharField(choices=[('REPORTED', 'Reported'), ('ACTION_TAKEN', 'Action Taken'), ('RESOLVED', 'Resolved'), ('DISMISSED', 'Dismissed')], db_index=True, default='REPORTED', max_length=20)),
                ('reported_by_name', models.CharField(blank=True, default='', max_length=255)),
                ('remarks', models.TextField(blank=True, default='', help_text='Incident notes and context')),
                ('action_notes', models.TextField(blank=True, default='', help_text='Counseling, parent notification, or resolution notes')),
                ('incident_date', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='incident_logs', to='discipline.disciplinecategory')),
                ('reported_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reported_discipline_incidents', to=settings.AUTH_USER_MODEL)),
                ('student', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='discipline_incidents', to='academics.studentprofile')),
            ],
            options={
                'verbose_name': 'Discipline Incident Log',
                'verbose_name_plural': 'Discipline Incident Logs',
                'ordering': ('-incident_date',),
            },
        ),
    ]
