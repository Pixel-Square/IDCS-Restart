"""Seed the BRANDING role and its permissions, plus event-approval permissions.

Usage:
  python manage.py seed_branding_role

This creates:
- Role: BRANDING  →  branding.access, branding.list_posters, events.branding_review, events.bulk_delete_proposals
- Role: STAFF     →  events.create_proposal
- Role: FACULTY   →  events.create_proposal
- Role: HOD       →  events.hod_approve
- Role: HAA       →  events.haa_approve

Frontend can use `branding.access` to show the Branding folder.
Backend uses it to guard Canva/Template endpoints.
"""

from django.core.management.base import BaseCommand

from accounts.models import Role, Permission, RolePermission


BRANDING_PERMISSIONS = [
    ('branding.access', 'Access Branding folder pages and template files'),
    ('branding.list_posters', 'Access the Branding List Posters page'),
    ('events.branding_review', 'Review event proposals forwarded to Branding'),
    ('events.bulk_delete_proposals', 'Delete all event proposals for workflow reset testing'),
]

# Extra permissions assigned to other existing roles
EXTRA_ROLE_PERMISSIONS = [
    ('STAFF',   'events.create_proposal',  'Create and forward event proposals'),
    ('FACULTY', 'events.create_proposal',  'Create and forward event proposals'),
    ('HOD',     'events.hod_approve',      'Approve event proposals as HOD'),
    ('HAA',     'events.haa_approve',      'Approve event proposals as HAA'),
]


class Command(BaseCommand):
    help = 'Ensure the BRANDING role, event-approval permissions, and role-perm links exist.'

    def handle(self, *args, **options):
        # ── BRANDING role ───────────────────────────────────────────────────
        role, created = Role.objects.get_or_create(
            name='BRANDING',
            defaults={'description': 'Branding team — Canva templates, poster maker, proposal docs'},
        )
        if created:
            self.stdout.write(self.style.SUCCESS('Created role: BRANDING'))
        else:
            self.stdout.write('Role already exists: BRANDING')

        for code, description in BRANDING_PERMISSIONS:
            perm, perm_created = Permission.objects.get_or_create(
                code=code,
                defaults={'description': description},
            )
            if perm_created:
                self.stdout.write(self.style.SUCCESS(f'  Created permission: {code}'))

            _, rp_created = RolePermission.objects.get_or_create(role=role, permission=perm)
            if rp_created:
                self.stdout.write(self.style.SUCCESS(f'  Assigned permission to BRANDING: {code}'))
            else:
                self.stdout.write(f'  Permission already assigned: {code}')

        # ── Extra role → permission mappings ────────────────────────────────
        for role_name, code, description in EXTRA_ROLE_PERMISSIONS:
            r, _ = Role.objects.get_or_create(
                name=role_name,
                defaults={'description': f'{role_name} role'},
            )
            p, p_created = Permission.objects.get_or_create(
                code=code,
                defaults={'description': description},
            )
            if p_created:
                self.stdout.write(self.style.SUCCESS(f'  Created permission: {code}'))
            _, rp_created = RolePermission.objects.get_or_create(role=r, permission=p)
            if rp_created:
                self.stdout.write(self.style.SUCCESS(f'  Assigned {code} → {role_name}'))
            else:
                self.stdout.write(f'  {code} already assigned to {role_name}')

        self.stdout.write(self.style.SUCCESS('\nDone. All event-approval roles/permissions are ready.'))
