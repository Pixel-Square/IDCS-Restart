"""Create and map announcement permissions to roles.

Usage:
    python manage.py create_announcement_permissions
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Permission, Role, RolePermission


PERMISSIONS = {
    'announcements.view_announcement_page': 'View announcements page',
    'announcements.create_announcement': 'Create announcements',
    'announcements.manage_announcement': 'Edit/delete announcements',
}

ROLE_MAPPING = {
    'STUDENT': ['announcements.view_announcement_page'],
    'STAFF': ['announcements.view_announcement_page', 'announcements.create_announcement'],
    'HOD': ['announcements.view_announcement_page', 'announcements.create_announcement'],
    'IQAC': ['announcements.view_announcement_page', 'announcements.create_announcement'],
    'PRINCIPAL': [
        'announcements.view_announcement_page',
        'announcements.create_announcement',
        'announcements.manage_announcement',
    ],
}


class Command(BaseCommand):
    help = 'Create or update announcement permissions and assign role mappings'

    def handle(self, *args, **options):
        created = 0
        updated = 0
        mapped = 0

        with transaction.atomic():
            for code, description in PERMISSIONS.items():
                perm, is_created = Permission.objects.get_or_create(code=code, defaults={'description': description})
                if is_created:
                    created += 1
                    self.stdout.write(self.style.SUCCESS(f'Created permission: {code}'))
                elif perm.description != description:
                    perm.description = description
                    perm.save(update_fields=['description'])
                    updated += 1
                    self.stdout.write(self.style.WARNING(f'Updated permission: {code}'))

            for role_name, perm_codes in ROLE_MAPPING.items():
                role = Role.objects.filter(name=role_name).first()
                if not role:
                    self.stdout.write(self.style.WARNING(f'Role missing, skipped: {role_name}'))
                    continue

                for perm_code in perm_codes:
                    perm = Permission.objects.filter(code=perm_code).first()
                    if not perm:
                        continue
                    _, is_created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    if is_created:
                        mapped += 1

        self.stdout.write(self.style.SUCCESS(
            f'Announcement permission setup complete. created={created}, updated={updated}, role_mappings_added={mapped}'
        ))
