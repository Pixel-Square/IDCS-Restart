"""
Management command: seed_default_roles

1. Ensures the base roles — STUDENT, STAFF, ADMIN — exist in accounts_role.
2. Backfills the Role.features M2M junction table from FeatureCatalog.applicable_roles
   so that both data paths (M2M and applicable_roles) are in sync.
3. Backfills CollegeRole entries for every existing college:
   - Always adds STUDENT + STAFF
   - Derives additional roles from each college's enabled features

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
    help = 'Ensure STUDENT, STAFF, ADMIN roles exist, backfill Role.features M2M, and seed CollegeRole per college.'

    def handle(self, *args, **options):
        from accounts.models import Role
        from college.models import College, FeatureCatalog, CollegeFeature, CollegeRole

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

        # ── Step 3: Backfill CollegeRole for every existing college ──────────
        self.stdout.write('\n── Step 3: Backfilling CollegeRole per college ──')

        student_role = all_roles.get('STUDENT')
        staff_role = all_roles.get('STAFF')
        admin_role = all_roles.get('ADMIN')
        college_roles_created = 0

        for college in College.objects.all():
            self.stdout.write(f'\n  College: {college.code} ({college.name})')

            # Always add STUDENT + STAFF
            for base_role in [student_role, staff_role]:
                if base_role:
                    _, created = CollegeRole.objects.get_or_create(
                        college=college, role=base_role,
                        defaults={'is_active': True},
                    )
                    if created:
                        college_roles_created += 1
                        self.stdout.write(self.style.SUCCESS(f'    ✔  Added {base_role.name}'))

            # Add ADMIN if any staff in this college has the ADMIN role
            if admin_role:
                from academics.models import StaffProfile
                has_admin = StaffProfile.objects.filter(
                    college=college,
                    user__roles=admin_role,
                ).exists()
                if has_admin:
                    _, created = CollegeRole.objects.get_or_create(
                        college=college, role=admin_role,
                        defaults={'is_active': True},
                    )
                    if created:
                        college_roles_created += 1
                        self.stdout.write(self.style.SUCCESS(f'    ✔  Added ADMIN'))

            # Derive roles from enabled features
            enabled_features = CollegeFeature.objects.filter(
                college=college, is_enabled=True
            ).select_related('feature')

            for cf in enabled_features:
                feat = cf.feature
                if not feat.applicable_roles:
                    continue
                for role_name in feat.applicable_roles.split(','):
                    role_name = role_name.strip().upper()
                    if role_name and role_name != 'SUPER_ADMIN':
                        role_obj = all_roles.get(role_name)
                        if role_obj:
                            _, created = CollegeRole.objects.get_or_create(
                                college=college, role=role_obj,
                                defaults={'is_active': True},
                            )
                            if created:
                                college_roles_created += 1
                                self.stdout.write(self.style.SUCCESS(f'    ✔  Added {role_obj.name} (from feature {feat.code})'))

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write('')
        if created_names:
            self.stdout.write(self.style.SUCCESS(
                f'Created {len(created_names)} new role(s): {", ".join(created_names)}'
            ))
        self.stdout.write(self.style.SUCCESS(
            f'Backfilled {backfilled} Role.features M2M entries.'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'Created {college_roles_created} CollegeRole entries.'
        ))
        self.stdout.write(self.style.SUCCESS('\nDone.'))
