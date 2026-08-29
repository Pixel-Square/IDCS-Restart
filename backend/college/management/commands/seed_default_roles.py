"""
Management command: seed_default_roles

1. Ensures the base roles — STUDENT, STAFF, ADMIN — exist in accounts_role.
2. Backfills the Role.features M2M junction table from FeatureCatalog.applicable_roles
   so that both data paths (M2M and applicable_roles) are in sync.

Run once after this deployment to fix any existing colleges.

Usage:
    python manage.py seed_default_roles
"""

from django.core.management.base import BaseCommand


DEFAULT_ROLES = [
    {'name': 'STUDENT', 'description': 'Default role for all enrolled students'},
    {'name': 'STAFF',   'description': 'Default role for all staff / faculty members'},
    {'name': 'ADMIN',   'description': 'College administrator role'},
]


class Command(BaseCommand):
    help = 'Ensure STUDENT, STAFF, ADMIN roles exist and backfill Role.features M2M from FeatureCatalog.applicable_roles.'

    def handle(self, *args, **options):
        from accounts.models import Role
        from college.models import FeatureCatalog

        # ── Step 1: Ensure default roles exist ──────────────────────────────
        self.stdout.write('\n── Step 1: Ensuring default roles ──')
        created_names = []
        for role_def in DEFAULT_ROLES:
            role, created = Role.objects.get_or_create(
                name=role_def['name'],
                defaults={'description': role_def['description']},
            )
            if created:
                created_names.append(role.name)
                self.stdout.write(self.style.SUCCESS(f'  ✔  Created role: {role.name}'))
            else:
                self.stdout.write(f'  –  Already exists: {role.name}')

        # ── Step 2: Backfill Role.features M2M from applicable_roles ────────
        self.stdout.write('\n── Step 2: Backfilling Role.features M2M ──')

        # Build a role name → Role object map (case-insensitive)
        all_roles = {r.name.upper(): r for r in Role.objects.all()}

        backfilled = 0
        for feat in FeatureCatalog.objects.all():
            if not feat.applicable_roles:
                continue
            role_names = [n.strip().upper() for n in feat.applicable_roles.split(',') if n.strip()]
            for role_name in role_names:
                role_obj = all_roles.get(role_name)
                if role_obj and not feat.roles.filter(pk=role_obj.pk).exists():
                    feat.roles.add(role_obj)
                    backfilled += 1
                    self.stdout.write(f'  ✔  Linked {feat.code} → {role_obj.name}')

        if backfilled == 0:
            self.stdout.write('  –  M2M table already up to date.')

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write('')
        if created_names:
            self.stdout.write(self.style.SUCCESS(
                f'Created {len(created_names)} new role(s): {", ".join(created_names)}'
            ))
        self.stdout.write(self.style.SUCCESS(
            f'Backfilled {backfilled} Role.features M2M entries.'
        ))
        self.stdout.write(self.style.SUCCESS('\nDone.'))
