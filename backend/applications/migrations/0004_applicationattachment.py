"""Add ApplicationAttachment model

Generated manually for the feature. Run `python manage.py migrate` to apply.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0003_add_sla_escalation'),
    ]

    operations = [
        migrations.CreateModel(
            name='ApplicationAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to='applications/attachments/%Y/%m/%d/')),
                ('label', models.CharField(blank=True, max_length=255)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('application', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='applications.application')),
                ('uploaded_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='uploaded_attachments', to='accounts.user')),
            ],
            options={'ordering': ('-uploaded_at',)},
        ),
    ]
