"""
Management command to ensure the Discipline Committee roles and their permissions exist in the DB.

Usage:
    python manage.py seed_discipline_roles

This sets up:
1. Role: Discipline Committee (DISCIPLINE_COMMITTEE)
2. Role: DisciplineCommitteeAdmin (DISCIPLINE_COMMITTEE_ADMIN)
"""

from django.core.management.base import BaseCommand
from accounts.models import Permission, Role, RolePermission


DISCIPLINE_PERMISSIONS = [
    ("discipline.view_admin", "View Discipline Committee admin dashboard and student barcodes"),
    ("discipline.manage_config", "Configure Discipline categories, rules and semester mappings"),
    ("discipline.view_logs", "View Discipline incident logs and audits"),
    ("discipline.log_incident", "Log and record student discipline incidents"),
]


class Command(BaseCommand):
    help = "Ensure Discipline Committee and DisciplineCommitteeAdmin roles exist with permissions."

    def handle(self, *args, **options):
        # 1. Ensure permissions exist
        perm_objs = []
        for code, description in DISCIPLINE_PERMISSIONS:
            perm, perm_created = Permission.objects.get_or_create(
                code=code,
                defaults={"description": description},
            )
            perm_objs.append(perm)
            if perm_created:
                self.stdout.write(self.style.SUCCESS(f"  Created permission: {code}"))
            else:
                self.stdout.write(f"  Permission already exists: {code}")

        # 2. Setup DisciplineCommitteeAdmin role
        admin_role_names = ["DisciplineCommitteeAdmin", "DISCIPLINE_COMMITTEE_ADMIN"]
        for role_name in admin_role_names:
            role, created = Role.objects.get_or_create(
                name=role_name,
                defaults={"description": "Discipline Committee Administrator — manage rules, barcodes, and audit logs"},
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created role: {role_name}"))
            else:
                self.stdout.write(f"Role already exists: {role_name}")

            # Assign all discipline permissions to admin
            for perm in perm_objs:
                _, rp_created = RolePermission.objects.get_or_create(role=role, permission=perm)
                if rp_created:
                    self.stdout.write(self.style.SUCCESS(f"  Assigned {perm.code} to {role_name}"))

        # 3. Setup Discipline Committee (staff/member) role
        staff_role_names = ["Discipline Committee", "DISCIPLINE_COMMITTEE"]
        staff_perms = [p for p in perm_objs if p.code in ["discipline.log_incident", "discipline.view_logs", "discipline.view_admin"]]
        for role_name in staff_role_names:
            role, created = Role.objects.get_or_create(
                name=role_name,
                defaults={"description": "Discipline Committee Member — log student violations and view records"},
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created role: {role_name}"))
            else:
                self.stdout.write(f"Role already exists: {role_name}")

            for perm in staff_perms:
                _, rp_created = RolePermission.objects.get_or_create(role=role, permission=perm)
                if rp_created:
                    self.stdout.write(self.style.SUCCESS(f"  Assigned {perm.code} to {role_name}"))

        self.stdout.write(self.style.SUCCESS("\nDone. Discipline Committee roles and permissions are ready."))
