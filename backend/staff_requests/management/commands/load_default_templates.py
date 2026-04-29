"""
Management command to load default request templates (5 normal + 5 SPL).

This creates the 10 default templates with all their configurations:
- Normal templates (for regular staff)
- SPL templates (for administrative roles)
- Approval workflows
- Leave policies
- Form schemas
- Attendance actions

Usage:
  python manage.py load_default_templates

Options:
  --force: Delete existing templates and reload (use with caution!)
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from staff_requests.models import RequestTemplate, ApprovalStep


class Command(BaseCommand):
    help = 'Load default request templates (5 normal + 5 SPL templates)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Delete existing templates and reload',
        )

    def handle(self, *args, **options):
        force = options.get('force', False)
        
        if force:
            self.stdout.write(self.style.WARNING('Force mode: Deleting existing templates...'))
            RequestTemplate.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('Existing templates deleted'))
        
        # Check if templates already exist
        existing_count = RequestTemplate.objects.count()
        if existing_count > 0 and not force:
            self.stdout.write(
                self.style.WARNING(
                    f'Found {existing_count} existing templates. Use --force to overwrite.'
                )
            )
            return
        
        self.stdout.write(self.style.SUCCESS('Loading default templates...'))
        
        with transaction.atomic():
            # Define the 10 templates
            templates_data = self._get_templates_data()
            
            for template_data in templates_data:
                approval_steps = template_data.pop('approval_steps')
                
                # Create or update template
                template, created = RequestTemplate.objects.update_or_create(
                    name=template_data['name'],
                    defaults=template_data
                )
                
                action = 'Created' if created else 'Updated'
                self.stdout.write(f'  {action}: {template.name}')
                
                # Delete existing approval steps and create new ones
                ApprovalStep.objects.filter(template=template).delete()
                
                for step_order, approver_role in enumerate(approval_steps, start=1):
                    ApprovalStep.objects.create(
                        template=template,
                        step_order=step_order,
                        approver_role=approver_role
                    )
                    self.stdout.write(f'    - Step {step_order}: {approver_role}')
        
        # Summary
        total = RequestTemplate.objects.count()
        normal = RequestTemplate.objects.filter(is_active=True).exclude(name__endswith=' - SPL').count()
        spl = RequestTemplate.objects.filter(is_active=True, name__endswith=' - SPL').count()
        
        self.stdout.write(self.style.SUCCESS(f'\n✓ Successfully loaded {total} templates'))
        self.stdout.write(f'  - Normal templates: {normal}')
        self.stdout.write(f'  - SPL templates: {spl}')
        self.stdout.write(self.style.SUCCESS('  - All templates are editable by HR'))

    def _get_templates_data(self):
        """Returns the configuration for all 10 default templates."""
        
        # Common form schema for leave-type requests
        leave_form_schema = [
            {
                "name": "reason",
                "type": "text",
                "label": "Reason",
                "required": True
            },
            {
                "name": "from_date",
                "type": "date",
                "label": "From Date",
                "required": True,
                "help_text": "Start date of leave/request"
            },
            {
                "name": "from_noon",
                "type": "select",
                "label": "From Noon",
                "options": ["Full day", "FN", "AN"],
                "required": True,
                "help_text": "Select FN (morning) or AN (afternoon) for start date"
            },
            {
                "name": "to_date",
                "type": "date",
                "label": "To Date",
                "required": False,
                "help_text": "End date (optional, leave empty for same day)"
            },
            {
                "name": "to_noon",
                "type": "select",
                "label": "To Noon",
                "options": ["Full day", "FN", "AN"],
                "required": False,
                "help_text": "Select FN or AN for end date (optional)"
            }
        ]
        
        # Common late entry form schema
        late_entry_form_schema = [
            {
                "name": "reason",
                "type": "text",
                "label": "Reason",
                "required": True
            },
            {
                "name": "from_date",
                "type": "date",
                "label": "Date",
                "required": True
            },
            {
                "name": "shift",
                "type": "select",
                "label": "Shift",
                "required": True,
                "options": ["FN", "AN"],
                "help_text": "FN for forenoon, AN for afternoon"
            },
            {
                "name": "late_duration",
                "type": "select",
                "label": "Late Duration",
                "required": True,
                "options": ["10 mins", "1 hr"],
                "help_text": "10 mins is FN-only and auto-approves"
            }
        ]
        
        # Common OD form schema
        od_form_schema = [
            {
                "name": "type",
                "type": "select",
                "label": "OD Type",
                "options": ["ODB - Basic", "ODR - Research", "ODP - Professional", "ODO - Out Reach"],
                "required": True
            },
            {
                "name": "reason",
                "type": "text",
                "label": "Reason",
                "required": True
            },
            {
                "name": "from_date",
                "type": "date",
                "label": "From Date",
                "required": True
            },
            {
                "name": "from_noon",
                "type": "select",
                "label": "From Noon",
                "options": ["Full Day ", "FN ", "AN"],
                "required": True
            },
            {
                "name": "to_date",
                "type": "date",
                "label": "To Date",
                "required": False
            },
            {
                "name": "to_noon",
                "type": "select",
                "label": "To Noon",
                "options": ["Full Day ", "FN ", "AN"],
                "required": False
            }
        ]
        
        # Common roles
        COMMON_ROLES = ["STAFF", "FACULTY", "ASSISTANT", "CLERK"]
        SPL_ROLES = ["IQAC", "HR", "PS", "HOD", "CFSW", "EDC", "COE", "HAA"]
        
        return [
            # 1. Casual Leave (Normal)
            {
                "name": "Casual Leave",
                "description": "Staffs can apply leave",
                "is_active": True,
                "form_schema": leave_form_schema,
                "allowed_roles": COMMON_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "deduct",
                    "from_date": "2026-01-01",
                    "to_date": "2026-12-31",
                    "split_date": "2026-07-01",
                    "attendance_status": "CL",
                    "allotment_per_role": {
                        "STAFF": 12,
                        "HOD": 12
                    },
                    "reset_duration": "monthly",
                    "overdraft_name": "LOP"
                },
                "attendance_action": {
                    "change_status": True,
                    "from_status": "absent",
                    "to_status": "present",
                    "apply_to_dates": ["from_date", "to_date"],
                    "date_format": "YYYY-MM-DD",
                    "add_notes": True,
                    "notes_template": "Leave approved"
                },
                "approval_steps": ["HOD", "HR"]
            },
            
            # 2. Compensatory leave (Normal)
            {
                "name": "Compensatory leave",
                "description": "Staffs can apply",
                "is_active": True,
                "form_schema": leave_form_schema,
                "allowed_roles": COMMON_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "deduct",
                    "attendance_status": "COL"
                },
                "attendance_action": {
                    "change_status": True,
                    "from_status": "absent",
                    "to_status": "present",
                    "apply_to_dates": ["from_date", "to_date"],
                    "date_format": "YYYY-MM-DD",
                    "add_notes": True,
                    "notes_template": "COL Leave approved"
                },
                "approval_steps": ["HOD", "HR"]
            },
            
            # 3. Late Entry Permission (Normal)
            {
                "name": "Late Entry Permission",
                "description": "Staff can apply for late entry permission",
                "is_active": True,
                "form_schema": late_entry_form_schema,
                "allowed_roles": COMMON_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "neutral"
                },
                "attendance_action": {},
                "approval_steps": ["HOD", "HR"]
            },
            
            # 4. ON duty (Normal)
            {
                "name": "ON duty",
                "description": "staffs will apply",
                "is_active": True,
                "form_schema": od_form_schema,
                "allowed_roles": COMMON_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "neutral",
                    "attendance_status": "OD"
                },
                "attendance_action": {
                    "change_status": True,
                    "from_status": "absent",
                    "to_status": "present",
                    "apply_to_dates": ["from_date", "to_date"],
                    "date_format": "YYYY-MM-DD",
                    "add_notes": True,
                    "notes_template": "OD approved"
                },
                "approval_steps": ["HOD", "HR"]
            },
            
            # 5. Others (Normal)
            {
                "name": "Others",
                "description": "staffs will apply",
                "is_active": True,
                "form_schema": leave_form_schema,
                "allowed_roles": COMMON_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "neutral"
                },
                "attendance_action": {},
                "approval_steps": ["HOD", "HR"]
            },
            
            # 6. Casual Leave - SPL
            {
                "name": "Casual Leave - SPL",
                "description": "Leave for special administrative roles",
                "is_active": True,
                "form_schema": leave_form_schema,
                "allowed_roles": SPL_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "deduct",
                    "from_date": "2026-01-01",
                    "to_date": "2026-12-31",
                    "split_date": "2026-07-01",
                    "attendance_status": "CL",
                    "allotment_per_role": {
                        "STAFF": 12,
                        "HOD": 12
                    },
                    "reset_duration": "monthly",
                    "overdraft_name": "LOP"
                },
                "attendance_action": {
                    "change_status": True,
                    "from_status": "absent",
                    "to_status": "present",
                    "apply_to_dates": ["from_date", "to_date"],
                    "date_format": "YYYY-MM-DD",
                    "add_notes": True,
                    "notes_template": "Leave approved"
                },
                "approval_steps": ["PRINCIPAL"]
            },
            
            # 7. Compensatory leave - SPL
            {
                "name": "Compensatory leave - SPL",
                "description": "COL for special administrative roles",
                "is_active": True,
                "form_schema": leave_form_schema,
                "allowed_roles": SPL_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "deduct",
                    "attendance_status": "COL"
                },
                "attendance_action": {
                    "change_status": True,
                    "from_status": "absent",
                    "to_status": "present",
                    "apply_to_dates": ["from_date", "to_date"],
                    "date_format": "YYYY-MM-DD",
                    "add_notes": True,
                    "notes_template": "COL Leave approved"
                },
                "approval_steps": ["PRINCIPAL"]
            },
            
            # 8. Late Entry Permission - SPL
            {
                "name": "Late Entry Permission - SPL",
                "description": "Late entry for special administrative roles",
                "is_active": True,
                "form_schema": late_entry_form_schema,
                "allowed_roles": SPL_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "neutral"
                },
                "attendance_action": {},
                "approval_steps": ["PRINCIPAL"]
            },
            
            # 9. ON duty - SPL
            {
                "name": "ON duty - SPL",
                "description": "OD for special administrative roles",
                "is_active": True,
                "form_schema": od_form_schema,
                "allowed_roles": SPL_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "neutral",
                    "attendance_status": "OD"
                },
                "attendance_action": {
                    "change_status": True,
                    "from_status": "absent",
                    "to_status": "present",
                    "apply_to_dates": ["from_date", "to_date"],
                    "date_format": "YYYY-MM-DD",
                    "add_notes": True,
                    "notes_template": "OD approved"
                },
                "approval_steps": ["PRINCIPAL"]
            },
            
            # 10. Others - SPL
            {
                "name": "Others - SPL",
                "description": "Other requests for special administrative roles",
                "is_active": True,
                "form_schema": leave_form_schema,
                "allowed_roles": SPL_ROLES,
                "ledger_policy": {},
                "leave_policy": {
                    "action": "neutral"
                },
                "attendance_action": {},
                "approval_steps": ["PRINCIPAL"]
            }
        ]
