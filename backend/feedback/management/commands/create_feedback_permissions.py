"""
Django management command to create or update feedback module permissions.

Usage:
    python manage.py create_feedback_permissions

This command ensures that all required feedback permissions exist and are properly
mapped to the appropriate roles in the accounts app permission system.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from accounts.models import Role, Permission, RolePermission


class Command(BaseCommand):
    help = 'Create or update feedback module permissions and role mappings'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Creating/updating feedback permissions...'))
        
        # Define feedback permissions with lowercase codes (following project convention)
        feedback_permissions = {
            'feedback.feedback_page': 'View feedback page',
            'feedback.create': 'Create feedback forms (HOD)',
            'feedback.reply': 'Reply to feedback (Staff & Students)',
        }
        
        # Define role-permission mappings
        role_permission_mapping = {
            'HOD': ['feedback.feedback_page', 'feedback.create'],
            'STAFF': ['feedback.feedback_page', 'feedback.reply'],
            'STUDENT': ['feedback.feedback_page', 'feedback.reply'],
        }
        
        with transaction.atomic():
            # Step 1: Create permissions
            self.stdout.write('Step 1: Creating permissions...')
            created_perms = []
            updated_perms = []
            
            for code, description in feedback_permissions.items():
                perm, created = Permission.objects.get_or_create(
                    code=code,
                    defaults={'description': description}
                )
                if created:
                    created_perms.append(code)
                    self.stdout.write(
                        self.style.SUCCESS(f'  ✓ Created permission: {code}')
                    )
                else:
                    # Update description if it changed
                    if perm.description != description:
                        perm.description = description
                        perm.save()
                        updated_perms.append(code)
                        self.stdout.write(
                            self.style.WARNING(f'  ↻ Updated permission: {code}')
                        )
                    else:
                        self.stdout.write(
                            self.style.NOTICE(f'  - Permission already exists: {code}')
                        )
            
            # Step 2: Map permissions to roles
            self.stdout.write('\nStep 2: Mapping permissions to roles...')
            mapped_count = 0
            skipped_count = 0
            missing_roles = []
            
            for role_name, perm_codes in role_permission_mapping.items():
                try:
                    role = Role.objects.get(name=role_name)
                    
                    for perm_code in perm_codes:
                        try:
                            perm = Permission.objects.get(code=perm_code)
                            role_perm, created = RolePermission.objects.get_or_create(
                                role=role,
                                permission=perm
                            )
                            
                            if created:
                                mapped_count += 1
                                self.stdout.write(
                                    self.style.SUCCESS(
                                        f'  ✓ Mapped {perm_code} to {role_name}'
                                    )
                                )
                            else:
                                skipped_count += 1
                                self.stdout.write(
                                    self.style.NOTICE(
                                        f'  - Mapping already exists: {role_name} -> {perm_code}'
                                    )
                                )
                        except Permission.DoesNotExist:
                            self.stdout.write(
                                self.style.ERROR(
                                    f'  ✗ Permission not found: {perm_code}'
                                )
                            )
                
                except Role.DoesNotExist:
                    missing_roles.append(role_name)
                    self.stdout.write(
                        self.style.WARNING(
                            f'  ! Role not found: {role_name} (skipping)'
                        )
                    )
        
        # Summary
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('\nSummary:'))
        self.stdout.write(f'  Permissions created: {len(created_perms)}')
        self.stdout.write(f'  Permissions updated: {len(updated_perms)}')
        self.stdout.write(f'  Role mappings created: {mapped_count}')
        self.stdout.write(f'  Role mappings skipped (already exist): {skipped_count}')
        
        if missing_roles:
            self.stdout.write(
                self.style.WARNING(
                    f'\n  Warning: {len(missing_roles)} role(s) not found: {", ".join(missing_roles)}'
                )
            )
            self.stdout.write(
                '  These roles need to be created before permissions can be mapped to them.'
            )
        
        self.stdout.write('\n' + self.style.SUCCESS('✓ Feedback permissions setup complete!'))
        self.stdout.write('=' * 60 + '\n')
