"""
Management command: setup_page_permissions

Ensures the Students page and Staff Directory page permissions exist in the
database and are assigned to the correct roles.

Usage:
    python manage.py setup_page_permissions
    python manage.py setup_page_permissions --dry-run

Permission mapping:
    Students page:
        - students.view_students       → IQAC, HOD, AHOD, ADVISOR, STAFF, HAA, AP
        - students.view_all_students   → IQAC, HAA, AP
        - students.view_department_students → HOD, AHOD, ADVISOR
        - academics.view_my_students   → ADVISOR, STAFF
        - academics.view_mentees       → ADVISOR, STAFF

    Staff Directory:
        - academics.view_staffs_page   → IQAC, HOD, AHOD, HAA, AP
        - academics.view_all_staff     → IQAC, HAA, AP
"""

from django.core.management.base import BaseCommand

PERMISSIONS = [
    # (code, description)
    ('students.view_students',           'Can access the Students page'),
    ('students.view_all_students',       'Can view students from all departments'),
    ('students.view_department_students', 'Can view students in own department'),
    ('academics.view_my_students',       'Can view own advised students'),
    ('academics.view_mentees',           'Can view own mentee students'),
    ('academics.view_staffs_page',       'Can access the Staff Directory page'),
    ('academics.view_all_staff',         'Can view staff from all departments'),
]

# Map: permission code -> list of role names that should have it
ROLE_PERMISSION_MAP = {
    'students.view_students': [
        'IQAC', 'HOD', 'AHOD', 'ADVISOR', 'STAFF', 'HAA', 'AP',
        # lowercase variants from legacy seed data
        'hod', 'ahod',
    ],
    'students.view_all_students': [
        'IQAC', 'HAA', 'AP',
    ],
    'students.view_department_students': [
        'HOD', 'AHOD', 'ADVISOR', 'HAA', 'AP',
        'hod', 'ahod',
    ],
    'academics.view_my_students': [
        'ADVISOR', 'STAFF',
    ],
    'academics.view_mentees': [
        'ADVISOR', 'STAFF',
    ],
    'academics.view_staffs_page': [
        'IQAC', 'HOD', 'AHOD', 'HAA', 'AP',
        'hod', 'ahod',
    ],
    'academics.view_all_staff': [
        'IQAC', 'HAA', 'AP',
    ],
}


class Command(BaseCommand):
    help = 'Ensure Students page and Staff Directory page permissions are created and assigned to roles'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would happen without making any changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        from accounts.models import Permission, Role, RolePermission

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved\n'))

        # Step 1: Ensure all permissions exist
        self.stdout.write('=== Step 1: Ensuring permissions exist ===')
        perm_objects = {}
        for code, description in PERMISSIONS:
            if dry_run:
                exists = Permission.objects.filter(code=code).exists()
                if not exists:
                    self.stdout.write(f'  [DRY RUN] Would create: {code}')
                else:
                    self.stdout.write(f'  Already exists: {code}')
                # Load or fake the object for the assignment step
                obj = Permission.objects.filter(code=code).first()
                if obj:
                    perm_objects[code] = obj
            else:
                obj, created = Permission.objects.get_or_create(
                    code=code,
                    defaults={'description': description},
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f'  ✓ Created permission: {code}'))
                else:
                    self.stdout.write(f'  Already exists: {code}')
                perm_objects[code] = obj

        # Step 2: Assign permissions to roles
        self.stdout.write('\n=== Step 2: Assigning permissions to roles ===')
        all_roles = {r.name: r for r in Role.objects.all()}

        for perm_code, role_names in ROLE_PERMISSION_MAP.items():
            perm = perm_objects.get(perm_code)
            if not perm and not dry_run:
                self.stdout.write(self.style.WARNING(f'  Skipping {perm_code}: permission object not found'))
                continue

            for role_name in role_names:
                role = all_roles.get(role_name)
                if role is None:
                    # Role doesn't exist in this installation — skip silently
                    continue

                if dry_run:
                    exists = perm and RolePermission.objects.filter(role=role, permission=perm).exists()
                    if not exists:
                        self.stdout.write(f'  [DRY RUN] Would assign: {role_name} → {perm_code}')
                    else:
                        self.stdout.write(f'  Already assigned: {role_name} → {perm_code}')
                else:
                    _, created = RolePermission.objects.get_or_create(
                        role=role,
                        permission=perm,
                    )
                    if created:
                        self.stdout.write(self.style.SUCCESS(f'  ✓ Assigned: {role_name} → {perm_code}'))
                    else:
                        self.stdout.write(f'  Already assigned: {role_name} → {perm_code}')

        if not dry_run:
            self.stdout.write(self.style.SUCCESS('\n✅ Done. Users should now see the Students and Staff Directory pages in the sidebar.'))
            self.stdout.write(self.style.WARNING('Note: Users must log out and log back in (or wait for JWT refresh) to see the new permissions.'))
        else:
            self.stdout.write(self.style.WARNING('\n(Dry run complete — run without --dry-run to apply changes)'))
