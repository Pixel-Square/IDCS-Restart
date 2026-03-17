"""
Management command to ensure the SECURITY role and its permissions exist in the DB.

Usage:
    python manage.py seed_security_role
"""

from django.core.management.base import BaseCommand
from accounts.models import Role, Permission, RolePermission


# Permissions granted to the SECURITY role
SECURITY_PERMISSIONS = [
    ('idcsscan.access', 'Access the IDCSScan (RFID Scanner) pages'),
    ('idcsscan.lookup', 'Look up a student by RFID UID'),
    ('idcsscan.assign', 'Assign an RFID UID to a student'),
    ('idcsscan.unassign', 'Remove an RFID UID from a student'),
    ('idcsscan.manage_gate', 'Manage gates (create/update/activate) for gate scanning'),
    ('idcsscan.manage_security_users', 'Create and edit SECURITY staff user accounts'),
    ('idcsscan.pull_offline_data', 'Export/pull scan logs for offline reconciliation'),
]


class Command(BaseCommand):
    help = 'Ensure the SECURITY role and its IDCSScan permissions exist in the database.'

    def handle(self, *args, **options):
        # 1. Create or fetch the SECURITY role
        role, created = Role.objects.get_or_create(
            name='SECURITY',
            defaults={'description': 'Campus security staff — RFID scanner and gatepass access'},
        )
        if created:
            self.stdout.write(self.style.SUCCESS("Created role: SECURITY"))
        else:
            self.stdout.write("Role already exists: SECURITY")

        # 2. Create permissions and attach them to the role
        for code, description in SECURITY_PERMISSIONS:
            perm, perm_created = Permission.objects.get_or_create(
                code=code,
                defaults={'description': description},
            )
            if perm_created:
                self.stdout.write(self.style.SUCCESS(f"  Created permission: {code}"))

            _, rp_created = RolePermission.objects.get_or_create(role=role, permission=perm)
            if rp_created:
                self.stdout.write(self.style.SUCCESS(f"  Assigned permission to SECURITY: {code}"))
            else:
                self.stdout.write(f"  Permission already assigned: {code}")

        self.stdout.write(self.style.SUCCESS("\nDone. SECURITY role is ready."))
