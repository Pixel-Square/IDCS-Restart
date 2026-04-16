from django.db import migrations, models


def seed_vacation_templates(apps, schema_editor):
    RequestTemplate = apps.get_model('staff_requests', 'RequestTemplate')
    ApprovalStep = apps.get_model('staff_requests', 'ApprovalStep')

    common_roles = ['STAFF', 'FACULTY', 'ASSISTANT', 'CLERK']
    spl_roles = ['IQAC', 'HR', 'PS', 'HOD', 'CFSW', 'EDC', 'COE', 'HAA']

    common_schema = [
        {
            'name': 'reason',
            'type': 'text',
            'label': 'Reason',
            'required': True,
            'help_text': 'Provide reason for vacation request'
        },
        {
            'name': 'from_date',
            'type': 'date',
            'label': 'From Date',
            'required': True,
            'help_text': 'Auto-filled from selected vacation slot'
        },
        {
            'name': 'to_date',
            'type': 'date',
            'label': 'To Date',
            'required': True,
            'help_text': 'Auto-filled from selected vacation slot'
        },
    ]

    templates = [
        {
            'name': 'Vacation Application',
            'description': 'Apply vacation using HR-configured vacation slots',
            'allowed_roles': common_roles,
            'approval_steps': ['HOD', 'HR'],
        },
        {
            'name': 'Vacation Application - SPL',
            'description': 'Vacation application for SPL roles',
            'allowed_roles': spl_roles,
            'approval_steps': ['PRINCIPAL'],
        },
        {
            'name': 'Vacation Cancellation Form',
            'description': 'Cancel an already approved vacation request',
            'allowed_roles': common_roles,
            'approval_steps': ['HOD', 'HR'],
        },
        {
            'name': 'Vacation Cancellation Form - SPL',
            'description': 'Cancel an already approved vacation request (SPL)',
            'allowed_roles': spl_roles,
            'approval_steps': ['PRINCIPAL'],
        },
    ]

    for config in templates:
        template, _ = RequestTemplate.objects.update_or_create(
            name=config['name'],
            defaults={
                'description': config['description'],
                'is_active': True,
                'form_schema': common_schema,
                'allowed_roles': config['allowed_roles'],
                # Keep vacation templates neutral to avoid automatic attendance status writes.
                'leave_policy': {'action': 'neutral'},
                'attendance_action': {},
                'ledger_policy': {},
            }
        )

        ApprovalStep.objects.filter(template=template).delete()
        for order, role in enumerate(config['approval_steps'], start=1):
            ApprovalStep.objects.create(
                template=template,
                step_order=order,
                approver_role=role,
            )


def unseed_vacation_templates(apps, schema_editor):
    RequestTemplate = apps.get_model('staff_requests', 'RequestTemplate')
    RequestTemplate.objects.filter(
        name__in=[
            'Vacation Application',
            'Vacation Application - SPL',
            'Vacation Cancellation Form',
            'Vacation Cancellation Form - SPL',
        ]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('staff_requests', '0011_load_default_templates'),
    ]

    operations = [
        migrations.CreateModel(
            name='VacationEntitlementRule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('min_years', models.PositiveIntegerField(default=0)),
                ('min_months', models.PositiveIntegerField(default=0)),
                ('entitled_days', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('notes', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Vacation Entitlement Rule',
                'verbose_name_plural': 'Vacation Entitlement Rules',
                'ordering': ['-min_years', '-min_months', '-entitled_days'],
                'unique_together': {('min_years', 'min_months')},
            },
        ),
        migrations.CreateModel(
            name='VacationSlot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('semester', models.CharField(blank=True, default='', max_length=80)),
                ('slot_name', models.CharField(max_length=120)),
                ('from_date', models.DateField(db_index=True)),
                ('to_date', models.DateField(db_index=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Vacation Slot',
                'verbose_name_plural': 'Vacation Slots',
                'ordering': ['from_date', 'id'],
            },
        ),
        migrations.RunPython(seed_vacation_templates, unseed_vacation_templates),
    ]
