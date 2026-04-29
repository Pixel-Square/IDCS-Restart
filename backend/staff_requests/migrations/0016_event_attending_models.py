"""
Add Event Attending models and append 7 optional event fields to ON duty / ON duty - SPL templates.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def add_event_fields_to_od_templates(apps, schema_editor):
    """Append 7 optional event fields to ON duty and ON duty - SPL templates."""
    RequestTemplate = apps.get_model('staff_requests', 'RequestTemplate')

    EXTRA_FIELDS = [
        {"name": "event_title", "type": "text", "label": "Event Title", "required": False},
        {"name": "host_institution_name", "type": "text", "label": "Host Institution Name", "required": False},
        {
            "name": "mode_of_event", "type": "select", "label": "Mode of Event", "required": False,
            "options": ["Offline", "Online", "Hybrid"],
        },
        {
            "name": "nature_of_event", "type": "select", "label": "Nature of Event", "required": False,
            "options": ["Seminar", "Workshop", "FDP", "STTP", "Conference", "Online course", "Others"],
        },
        {"name": "platform_if_online", "type": "text", "label": "Platform (if Online)", "required": False},
        {"name": "expected_outcome", "type": "textarea", "label": "Expected Outcome of the Event", "required": False},
        {"name": "purpose", "type": "text", "label": "Purpose", "required": False},
    ]

    target_names = ['ON duty', 'ON duty - SPL']
    for tname in target_names:
        try:
            tpl = RequestTemplate.objects.get(name=tname)
        except RequestTemplate.DoesNotExist:
            continue

        schema = list(tpl.form_schema or [])
        existing_names = {f.get('name') for f in schema}
        for field in EXTRA_FIELDS:
            if field['name'] not in existing_names:
                schema.append(field)
        tpl.form_schema = schema
        tpl.save(update_fields=['form_schema'])


def remove_event_fields_from_od_templates(apps, schema_editor):
    """Reverse: remove the 7 event fields."""
    RequestTemplate = apps.get_model('staff_requests', 'RequestTemplate')
    remove_names = {
        'event_title', 'host_institution_name', 'mode_of_event',
        'nature_of_event', 'platform_if_online', 'expected_outcome', 'purpose',
    }
    for tname in ['ON duty', 'ON duty - SPL']:
        try:
            tpl = RequestTemplate.objects.get(name=tname)
        except RequestTemplate.DoesNotExist:
            continue
        tpl.form_schema = [f for f in (tpl.form_schema or []) if f.get('name') not in remove_names]
        tpl.save(update_fields=['form_schema'])


def seed_default_workflows(apps, schema_editor):
    """Seed default approval workflows for Event Attending forms."""
    EventAttendingApprovalWorkflow = apps.get_model('staff_requests', 'EventAttendingApprovalWorkflow')

    defaults = [
        # Staff / AHOD → HOD → IQAC → HAA → Principal
        ('STAFF', 1, 'HOD'),
        ('STAFF', 2, 'IQAC'),
        ('STAFF', 3, 'HAA'),
        ('STAFF', 4, 'PRINCIPAL'),
        ('AHOD', 1, 'HOD'),
        ('AHOD', 2, 'IQAC'),
        ('AHOD', 3, 'HAA'),
        ('AHOD', 4, 'PRINCIPAL'),
        # HOD / SPL → IQAC → HAA → Principal
        ('HOD', 1, 'IQAC'),
        ('HOD', 2, 'HAA'),
        ('HOD', 3, 'PRINCIPAL'),
        # IQAC → HAA → Principal
        ('IQAC', 1, 'HAA'),
        ('IQAC', 2, 'PRINCIPAL'),
        # HAA → Principal
        ('HAA', 1, 'PRINCIPAL'),
    ]

    for applicant_role, step_order, approver_role in defaults:
        EventAttendingApprovalWorkflow.objects.get_or_create(
            applicant_role=applicant_role,
            step_order=step_order,
            defaults={'approver_role': approver_role, 'is_active': True},
        )


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('staff_requests', '0015_vacation_confirm_slots'),
    ]

    operations = [
        # ── EventAttendingForm ──────────────────────────────────────────
        migrations.CreateModel(
            name='EventAttendingForm',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('travel_expenses', models.JSONField(default=list, help_text='Array of travel expense rows')),
                ('food_expenses', models.JSONField(default=list, help_text='Array of food expense rows')),
                ('other_expenses', models.JSONField(default=list, help_text='Array of other expense rows')),
                ('total_fees_spend', models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=12, null=True)),
                ('advance_amount_received', models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=12)),
                ('advance_date', models.DateField(blank=True, null=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='pending', max_length=20)),
                ('current_step', models.IntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('staff', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='event_attending_forms', to=settings.AUTH_USER_MODEL)),
                ('on_duty_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='event_attending_forms', to='staff_requests.staffrequest')),
            ],
            options={
                'ordering': ['-created_at'],
                'verbose_name': 'Event Attending Form',
                'verbose_name_plural': 'Event Attending Forms',
            },
        ),
        migrations.AddIndex(
            model_name='eventattendingform',
            index=models.Index(fields=['staff', 'status'], name='ea_staff_status_idx'),
        ),
        # ── EventAttendingFile ──────────────────────────────────────────
        migrations.CreateModel(
            name='EventAttendingFile',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('expense_type', models.CharField(choices=[('travel', 'Travel'), ('food', 'Food'), ('other', 'Other'), ('fees', 'Fees')], max_length=20)),
                ('expense_index', models.IntegerField(default=0, help_text='Row index within the expense type')),
                ('file', models.FileField(upload_to='event_attending_proofs/')),
                ('original_filename', models.CharField(max_length=255)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('event_form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='files', to='staff_requests.eventattendingform')),
            ],
            options={
                'ordering': ['expense_type', 'expense_index'],
                'verbose_name': 'Event Attending File',
                'verbose_name_plural': 'Event Attending Files',
            },
        ),
        # ── EventAttendingApprovalLog ───────────────────────────────────
        migrations.CreateModel(
            name='EventAttendingApprovalLog',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('step_order', models.IntegerField()),
                ('action', models.CharField(choices=[('approved', 'Approved'), ('rejected', 'Rejected')], max_length=20)),
                ('comments', models.TextField(blank=True)),
                ('action_date', models.DateTimeField(auto_now_add=True)),
                ('approver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='event_attending_approval_logs', to=settings.AUTH_USER_MODEL)),
                ('event_form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='approval_logs', to='staff_requests.eventattendingform')),
            ],
            options={
                'ordering': ['step_order', 'action_date'],
                'verbose_name': 'Event Attending Approval Log',
                'verbose_name_plural': 'Event Attending Approval Logs',
            },
        ),
        # ── EventAttendingApprovalWorkflow ──────────────────────────────
        migrations.CreateModel(
            name='EventAttendingApprovalWorkflow',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('applicant_role', models.CharField(help_text="Applicant's role, e.g. STAFF, HOD, IQAC, HAA", max_length=50)),
                ('step_order', models.IntegerField()),
                ('approver_role', models.CharField(max_length=50)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['applicant_role', 'step_order'],
                'verbose_name': 'Event Attending Approval Workflow',
                'verbose_name_plural': 'Event Attending Approval Workflows',
                'unique_together': {('applicant_role', 'step_order')},
            },
        ),
        # ── StaffEventDeclaration ───────────────────────────────────────
        migrations.CreateModel(
            name='StaffEventDeclaration',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('normal_events_budget', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('conference_budget', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('staff', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='event_declaration', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['staff__first_name', 'staff__last_name'],
                'verbose_name': 'Staff Event Declaration',
                'verbose_name_plural': 'Staff Event Declarations',
            },
        ),
        # ── Data migrations ────────────────────────────────────────────
        migrations.RunPython(add_event_fields_to_od_templates, remove_event_fields_from_od_templates),
        migrations.RunPython(seed_default_workflows, migrations.RunPython.noop),
    ]
