"""Add SLA fields to ApprovalStep

Generated manually as part of feature implementation. Run `python manage.py migrate` to apply.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0002_application_current_state_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='approvalstep',
            name='sla_hours',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='approvalstep',
            name='escalate_to_role',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='escalation_steps', to='accounts.role'),
        ),
    ]
