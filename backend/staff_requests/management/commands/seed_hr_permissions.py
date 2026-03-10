"""
Management command to create the required permissions for staff_requests
and assign them to the appropriate roles.

Permissions created:
  - staff_requests.manage_templates  → HR, ADMIN
  - staff_requests.approve_requests  → HR, HOD, AHOD, IQAC, PS, PRINCIPAL, ADMIN

Usage:
    python manage.py seed_hr_permissions
"""

from django.core.management.base import BaseCommand
from accounts.models import Permission, Role, RolePermission


PERMISSIONS = [
    {
        'code': 'staff_requests.manage_templates',
        'description': 'Full control over creating and editing request form templates/workflows',
        'roles': ['HR', 'ADMIN'],
    },
    {
        'code': 'staff_requests.approve_requests',
        'description': 'Access to the Pending Approvals dashboard to approve/reject staff requests',
        'roles': ['HR', 'HOD', 'AHOD', 'IQAC', 'PS', 'PRINCIPAL', 'ADMIN'],
    },
]


class Command(BaseCommand):
    help = 'Create staff_requests permissions and assign them to the appropriate roles'

    def handle(self, *args, **options):
        self.stdout.write('Seeding staff_requests permissions...\n')

        for perm_def in PERMISSIONS:
            perm, perm_created = Permission.objects.get_or_create(
                code=perm_def['code'],
                defaults={'description': perm_def['description']},
            )
            if perm_created:
                self.stdout.write(self.style.SUCCESS(f'  + Created permission: {perm.code}'))
            else:
                self.stdout.write(f'  ~ Permission already exists: {perm.code}')

            for role_name in perm_def['roles']:
                role = Role.objects.filter(name=role_name).first()
                if not role:
                    self.stdout.write(self.style.WARNING(f'    ! Role "{role_name}" not found, skipping'))
                    continue

                _, rp_created = RolePermission.objects.get_or_create(role=role, permission=perm)
                if rp_created:
                    self.stdout.write(self.style.SUCCESS(f'    + Assigned {perm.code} → {role_name}'))
                else:
                    self.stdout.write(f'    ~ Already assigned: {perm.code} → {role_name}')

        self.stdout.write(self.style.SUCCESS('\n✓ HR permissions seeded successfully!'))
