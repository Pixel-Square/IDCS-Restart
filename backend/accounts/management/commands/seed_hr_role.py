"""
Management command to ensure the HR role and its permissions exist in the DB.

Usage:
    python manage.py seed_hr_role

This role powers the HR sidebar section and the HR "Manage Gate" page.
"""

from django.core.management.base import BaseCommand

from accounts.models import Permission, Role, RolePermission


HR_PERMISSIONS = [
    ("staff_requests.manage_templates", "Manage Staff Request templates"),
    ("idcsscan.manage_gate", "Manage gates (create/update/activate) for gate scanning"),
    ("idcsscan.manage_security_users", "Create and edit SECURITY staff user accounts"),
    ("idcsscan.pull_offline_data", "Export/pull scan logs for offline reconciliation"),
]


class Command(BaseCommand):
    help = "Ensure the HR role and required permissions exist in the database."

    def handle(self, *args, **options):
        role, created = Role.objects.get_or_create(
            name="HR",
            defaults={"description": "HR staff — staff workflow admin + gate management"},
        )
        if created:
            self.stdout.write(self.style.SUCCESS("Created role: HR"))
        else:
            self.stdout.write("Role already exists: HR")

        for code, description in HR_PERMISSIONS:
            perm, perm_created = Permission.objects.get_or_create(
                code=code,
                defaults={"description": description},
            )
            if perm_created:
                self.stdout.write(self.style.SUCCESS(f"  Created permission: {code}"))

            _, rp_created = RolePermission.objects.get_or_create(role=role, permission=perm)
            if rp_created:
                self.stdout.write(self.style.SUCCESS(f"  Assigned permission to HR: {code}"))
            else:
                self.stdout.write(f"  Permission already assigned: {code}")

        self.stdout.write(self.style.SUCCESS("\nDone. HR role is ready."))
