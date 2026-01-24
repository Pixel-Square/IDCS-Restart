"""Add ApplicationFormVersion model and Application.form_version FK

Generated manually. Run `python manage.py migrate` to apply.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0004_applicationattachment'),
    ]

    operations = [
        migrations.CreateModel(
            name='ApplicationFormVersion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('version', models.PositiveIntegerField()),
                ('schema', models.JSONField(default=dict)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('application_type', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='form_versions', to='applications.applicationtype')),
            ],
            options={'ordering': ('-created_at',)},
        ),
        migrations.AddField(
            model_name='application',
            name='form_version',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='applications', to='applications.applicationformversion'),
        ),
    ]
