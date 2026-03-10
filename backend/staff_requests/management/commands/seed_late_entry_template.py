"""
Management command to create/update the Late Entry Permission request template.

NOTE: This template is now created automatically by data migration (0007_create_late_entry_template).
This command is provided for:
  - Updating/refreshing the template after code changes
  - Manual creation if migration was skipped
  - Testing purposes

Usage:
    python manage.py seed_late_entry_template
"""

from django.core.management.base import BaseCommand
from staff_requests.models import RequestTemplate, ApprovalStep


class Command(BaseCommand):
    help = 'Create or update the Late Entry Permission request template (also created by migration by default)'

    def handle(self, *args, **options):
        self.stdout.write('Creating/updating Late Entry Permission template...')
        
        # Create or update the template
        template, created = RequestTemplate.objects.update_or_create(
            name='Late Entry Permission',
            defaults={
                'description': 'Request permission for late entry with specified time duration. If approved, attendance status changes from absent to present.',
                'is_active': True,
                'form_schema': [
                    {
                        'name': 'date',
                        'type': 'date',
                        'label': 'Date',
                        'required': True,
                        'help_text': 'Date of late entry'
                    },
                    {
                        'name': 'shift',
                        'type': 'select',
                        'label': 'Shift',
                        'required': True,
                        'options': [
                            {'value': 'morning', 'label': 'Morning'},
                            {'value': 'evening', 'label': 'Evening'}
                        ],
                        'help_text': 'Which shift you will be late for'
                    },
                    {
                        'name': 'late_duration',
                        'type': 'select',
                        'label': 'Expected Late Duration',
                        'required': True,
                        'options': [
                            {'value': '10', 'label': '10 minutes'},
                            {'value': '30', 'label': '30 minutes'},
                            {'value': '60', 'label': '1 hour'},
                            {'value': '90', 'label': '1.5 hours'},
                            {'value': '120', 'label': '2 hours'}
                        ],
                        'help_text': 'How late you expect to be'
                    },
                    {
                        'name': 'reason',
                        'type': 'textarea',
                        'label': 'Reason',
                        'required': True,
                        'help_text': 'Reason for late entry'
                    }
                ],
                'allowed_roles': ['STAFF', 'FACULTY', 'HOD', 'ASSISTANT', 'CLERK'],
                'leave_policy': {
                    'action': 'neutral',  # No leave balance deduction
                },
                'attendance_action': {
                    'change_status': True,
                    'from_status': 'absent',
                    'to_status': 'present',
                    'apply_to_dates': ['date'],  # Apply to the 'date' field
                    'date_format': 'YYYY-MM-DD',
                    'add_notes': True,
                    'notes_template': 'Late Entry Permission: {shift} shift, {late_duration} mins late'
                }
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created Late Entry Permission template'))
        else:
            self.stdout.write(self.style.SUCCESS('✓ Updated Late Entry Permission template'))
        
        # Create approval steps
        # Step 1: HOD approval
        step1, created1 = ApprovalStep.objects.update_or_create(
            template=template,
            step_order=1,
            defaults={
                'approver_role': 'HOD'
            }
        )
        
        if created1:
            self.stdout.write(self.style.SUCCESS('  ✓ Created Step 1: HOD approval'))
        else:
            self.stdout.write(self.style.SUCCESS('  ✓ Updated Step 1: HOD approval'))
        
        self.stdout.write(self.style.SUCCESS('\n✓ Late Entry Permission template is ready!'))
        self.stdout.write('\nTemplate Details:')
        self.stdout.write(f'  - Name: {template.name}')
        self.stdout.write(f'  - Active: {template.is_active}')
        self.stdout.write(f'  - Form Fields: {len(template.form_schema)}')
        self.stdout.write(f'  - Approval Steps: {template.approval_steps.count()}')
        self.stdout.write(f'  - Updates Attendance: {template.attendance_action.get("change_status", False)}')
