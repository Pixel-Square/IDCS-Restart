"""
Idempotently ensure PRINCIPAL feedback permissions and role-permission mappings.

Usage:
    python manage.py fix_principal_role_permissions
"""

from django.core.management.base import BaseCommand
from django.core.cache import cache
from django.db import transaction

from accounts.models import Permission, Role, RolePermission


class Command(BaseCommand):
    help = "Ensure PRINCIPAL role + feedback principal permissions + mappings"

    def _resolve_principal_role(self):
        """
        Resolve role in a display-stable way for admin:
        - Always target exact uppercase 'PRINCIPAL'
        - If a mixed-case variant exists, keep it untouched (no destructive edit)
          and create uppercase PRINCIPAL as an additional role.
        """
        exact = Role.objects.filter(name='PRINCIPAL').first()
        if exact:
            return exact, False, "exact"

        created = Role.objects.create(name='PRINCIPAL', description='Principal role')
        return created, True, "created"

    def _permission_defaults(self, description):
        defaults = {'description': description}

        # Some deployments may include a dedicated `module` column on Permission.
        # Keep module normalized to lowercase feedback when available.
        perm_field_names = {f.name for f in Permission._meta.get_fields() if hasattr(f, 'name')}
        if 'module' in perm_field_names:
            defaults['module'] = 'feedback'

        return defaults

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Applying PRINCIPAL role-permission mapping fix...'))

        target_permissions = {
            'feedback.principal_feedback_page': 'Principal feedback page access',
            'feedback.principal_create': 'Principal can create institutional feedback',
            'feedback.principal_analytics': 'Principal can view feedback analytics',
            # Existing menu visibility permission.
            'feedback.feedback_page': 'View feedback page',
        }

        created_perms = []
        existing_perms = []
        created_maps = []
        existing_maps = []

        with transaction.atomic():
            role, role_created, role_source = self._resolve_principal_role()

            if role_created:
                self.stdout.write(self.style.SUCCESS('  ✓ Created role: PRINCIPAL'))
            else:
                self.stdout.write(self.style.SUCCESS(f"  ✓ Using role: {role.name} ({role_source})"))

            perms_by_code = {}
            for code, description in target_permissions.items():
                perm, created = Permission.objects.get_or_create(
                    code=code,
                    defaults=self._permission_defaults(description),
                )

                # If deployment has `module`, enforce lowercase feedback.
                if hasattr(perm, 'module') and getattr(perm, 'module', None) != 'feedback':
                    perm.module = 'feedback'
                    perm.save(update_fields=['module'])

                perms_by_code[code] = perm

                if created:
                    created_perms.append(code)
                    self.stdout.write(self.style.SUCCESS(f'  ✓ Created permission: {code}'))
                else:
                    existing_perms.append(code)
                    self.stdout.write(self.style.NOTICE(f'  - Permission exists: {code}'))

            for code in (
                'feedback.principal_feedback_page',
                'feedback.principal_create',
                'feedback.principal_analytics',
                'feedback.feedback_page',
            ):
                _, created = RolePermission.objects.get_or_create(
                    role=role,
                    permission=perms_by_code[code],
                )
                if created:
                    created_maps.append(code)
                    self.stdout.write(self.style.SUCCESS(f'  ✓ Mapped {role.name} -> {code}'))
                else:
                    existing_maps.append(code)
                    self.stdout.write(self.style.NOTICE(f'  - Mapping exists: {role.name} -> {code}'))

        # Refresh admin visibility for deployments using cache-backed permission lookups.
        try:
            cache.clear()
            self.stdout.write(self.style.SUCCESS('  ✓ Cache cleared'))
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f'  ! Cache clear skipped: {exc}'))

        # Remove duplicate display rows from legacy mixed-case Principal role mappings.
        # Keep canonical uppercase PRINCIPAL mappings only.
        legacy_role = Role.objects.filter(name='Principal').exclude(name='PRINCIPAL').first()
        if legacy_role:
            deleted, _ = RolePermission.objects.filter(
                role=legacy_role,
                permission__code__in=[
                    'feedback.principal_feedback_page',
                    'feedback.principal_create',
                    'feedback.principal_analytics',
                    'feedback.feedback_page',
                ],
            ).delete()
            if deleted:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Removed duplicate legacy mappings: {deleted}'))

        final = list(
            RolePermission.objects.filter(
                role__name__iexact='PRINCIPAL',
                permission__code__in=[
                    'feedback.principal_feedback_page',
                    'feedback.principal_create',
                    'feedback.principal_analytics',
                    'feedback.feedback_page',
                ],
            )
            .select_related('role', 'permission')
            .order_by('permission__code')
            .values_list('role__name', 'permission__code')
        )

        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('Result Summary'))
        self.stdout.write(f'  Permissions created: {len(created_perms)}')
        self.stdout.write(f'  Permissions existing: {len(existing_perms)}')
        self.stdout.write(f'  Mappings created: {len(created_maps)}')
        self.stdout.write(f'  Mappings existing: {len(existing_maps)}')
        self.stdout.write(f'  Final PRINCIPAL mappings: {final}')
        self.stdout.write('=' * 60)
