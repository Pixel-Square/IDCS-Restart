from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='AcademicYear',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=32, unique=True)),
                ('is_active', models.BooleanField(default=False)),
            ],
            options={'verbose_name': 'Academic Year', 'verbose_name_plural': 'Academic Years'},
        ),
        migrations.CreateModel(
            name='Department',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=16, unique=True)),
                ('name', models.CharField(max_length=128)),
            ],
            options={'ordering': ('code',)},
        ),
        migrations.CreateModel(
            name='Program',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=32, unique=True)),
            ],
        ),
        migrations.CreateModel(
            name='Course',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=128)),
                ('department', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='courses', to='academics.department')),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='courses', to='academics.program')),
            ],
            options={'unique_together': {('name', 'department', 'program')}},
        ),
        migrations.CreateModel(
            name='Semester',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.PositiveSmallIntegerField()),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='semesters', to='academics.course')),
            ],
            options={'unique_together': {('number', 'course')}},
        ),
        migrations.CreateModel(
            name='Section',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=8)),
                ('semester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sections', to='academics.semester')),
            ],
            options={'unique_together': {('name', 'semester')}},
        ),
        migrations.CreateModel(
            name='Subject',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=32, unique=True)),
                ('name', models.CharField(max_length=128)),
                ('semester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='subjects', to='academics.semester')),
            ],
        ),
        migrations.RemoveField(
            model_name='studentprofile',
            name='department',
        ),
        migrations.RemoveField(
            model_name='studentprofile',
            name='section',
        ),
        migrations.AddField(
            model_name='studentprofile',
            name='section',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='students', to='academics.section'),
        ),
        migrations.RemoveField(
            model_name='staffprofile',
            name='department',
        ),
        migrations.AddField(
            model_name='staffprofile',
            name='department',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='staff', to='academics.department'),
        ),
    ]
