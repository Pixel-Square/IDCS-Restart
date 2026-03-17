"""
Management command to create SPL (Special) versions of forms for specific roles.

This command:
1. Deletes the "Test Casual Leave" template
2. Creates SPL versions of 5 forms with Principal-only approval:
   - Casual Leave - SPL
   - Compensatory leave - SPL
   - Late Entry Permission - SPL
   - ON duty - SPL
   - Others - SPL

SPL forms are for specific roles: IQAC, HR, PS, HOD, CFSW, EDC, COE, HAA
These forms have the same logic as originals but only require Principal approval.

Usage:
    python manage.py create_spl_templates
"""

from django.core.management.base import BaseCommand
from staff_requests.models import RequestTemplate, ApprovalStep
from django.db import transaction
import json


class Command(BaseCommand):
    help = 'Create SPL versions of forms for special roles with Principal-only approval'
    
    # Special roles that should use SPL forms
    SPL_ROLES = ['IQAC', 'HR', 'PS', 'HOD', 'CFSW', 'EDC', 'COE', 'HAA']
    
    # Templates to duplicate
    TEMPLATES_TO_DUPLICATE = [
        'Casual Leave',
        'Compensatory leave',
        'Late Entry Permission',
        'ON duty',
        'Others'
    ]
    
    def handle(self, *args, **options):
        with transaction.atomic():
            self.stdout.write(self.style.WARNING('\n=== Creating SPL Templates ===\n'))
            
            # Step 1: Delete Test Casual Leave
            self.delete_test_template()
            
            # Step 2: Create SPL versions
            self.create_spl_templates()
            
            self.stdout.write(self.style.SUCCESS('\n✓ All SPL templates created successfully!\n'))
    
    def delete_test_template(self):
        """Delete or deactivate the Test Casual Leave template"""
        self.stdout.write('Step 1: Removing Test Casual Leave...')
        
        try:
            template = RequestTemplate.objects.get(name='Test Casual Leave')
            
            # Check if it has related requests
            if template.requests.exists():
                # Can't delete due to protected foreign keys, mark as inactive
                template.is_active = False
                template.save()
                self.stdout.write(self.style.WARNING(
                    f'  ⚠ Test Casual Leave has {template.requests.count()} related requests, marked as inactive instead'
                ))
            else:
                # No related requests, safe to delete
                template.delete()
                self.stdout.write(self.style.SUCCESS('  ✓ Deleted Test Casual Leave template'))
                
        except RequestTemplate.DoesNotExist:
            self.stdout.write(self.style.WARNING('  ⚠ Test Casual Leave template not found'))
    
    def create_spl_templates(self):
        """Create SPL versions of the 5 templates"""
        self.stdout.write('\nStep 2: Creating SPL templates...')
        
        for template_name in self.TEMPLATES_TO_DUPLICATE:
            try:
                # Find the original template
                original = RequestTemplate.objects.get(name=template_name)
                spl_name = f"{template_name} - SPL"
                
                # Check if SPL version already exists
                if RequestTemplate.objects.filter(name=spl_name).exists():
                    self.stdout.write(self.style.WARNING(f'  ⚠ {spl_name} already exists, updating...'))
                    spl_template = RequestTemplate.objects.get(name=spl_name)
                    
                    # Update existing template
                    spl_template.description = f"{original.description} (For special roles: {', '.join(self.SPL_ROLES)})"
                    spl_template.is_active = True
                    spl_template.form_schema = original.form_schema
                    spl_template.allowed_roles = self.SPL_ROLES
                    spl_template.leave_policy = original.leave_policy
                    spl_template.attendance_action = original.attendance_action
                    spl_template.save()
                else:
                    # Create new SPL template
                    spl_template = RequestTemplate.objects.create(
                        name=spl_name,
                        description=f"{original.description} (For special roles: {', '.join(self.SPL_ROLES)})",
                        is_active=True,
                        form_schema=original.form_schema,
                        allowed_roles=self.SPL_ROLES,
                        leave_policy=original.leave_policy,
                        attendance_action=original.attendance_action
                    )
                    self.stdout.write(self.style.SUCCESS(f'  ✓ Created {spl_name}'))
                
                # Delete existing approval steps for this template
                ApprovalStep.objects.filter(template=spl_template).delete()
                
                # Create Principal-only approval step
                ApprovalStep.objects.create(
                    template=spl_template,
                    step_order=1,
                    approver_role='PRINCIPAL'
                )
                
                self.stdout.write(f'    → Approval: Principal only')
                self.stdout.write(f'    → Roles: {", ".join(self.SPL_ROLES)}')
                
            except RequestTemplate.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'  ✗ Original template "{template_name}" not found!'))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ✗ Error creating {template_name} - SPL: {str(e)}'))
