"""
Utility helpers for college feature ↔ role synchronisation.

The central function :func:`sync_college_roles` must be called after any
change to a college's enabled features.  It ensures that *exactly* the
roles required by the currently-enabled features are **active** in
:model:`CollegeRole`, and that roles no longer needed are **deactivated**
(never deleted, so data is preserved and re-enabling restores cleanly).
"""

from __future__ import annotations

from django.db import transaction


# Roles that are always active for every college, regardless of features.
ALWAYS_ACTIVE_ROLES = {'STUDENT', 'STAFF'}


def sync_college_roles(college) -> dict:
    """Synchronise ``CollegeRole`` rows to match the college's enabled features.

    Logic
    -----
    1. Collect all role names referenced by the ``applicable_roles`` field of
       every *enabled* ``CollegeFeature`` for this college.
    2. Union them with :data:`ALWAYS_ACTIVE_ROLES`.
    3. For each required role name → ensure a ``CollegeRole`` row exists and
       ``is_active = True``.
    4. For any ``CollegeRole`` that is currently active but whose role name is
       **not** in the required set → set ``is_active = False``.

    Returns
    -------
    dict
        ``{"activated": [str, …], "deactivated": [str, …]}``
    """
    from .models import CollegeFeature, CollegeRole
    from accounts.models import Role

    # ── Step 1: determine which roles are required ──────────────────────────
    enabled_features = (
        CollegeFeature.objects
        .filter(college=college, is_enabled=True)
        .select_related('feature')
    )

    required_role_names: set[str] = set(ALWAYS_ACTIVE_ROLES)
    for cf in enabled_features:
        if cf.feature.applicable_roles:
            for rn in cf.feature.applicable_roles.split(','):
                rn = rn.strip().upper()
                if rn and rn != 'SUPER_ADMIN':
                    required_role_names.add(rn)

    activated: list[str] = []
    deactivated: list[str] = []

    with transaction.atomic():
        # ── Step 2: activate / create required roles ────────────────────────
        for role_name in required_role_names:
            role_obj = Role.objects.filter(name__iexact=role_name).first()
            if not role_obj:
                # Global role doesn't exist yet → create it
                role_obj = Role.objects.create(
                    name=role_name,
                    description=f'Auto-created for feature activation',
                )

            cr, created = CollegeRole.objects.get_or_create(
                college=college, role=role_obj,
                defaults={'is_active': True},
            )
            if not created and not cr.is_active:
                cr.is_active = True
                cr.save(update_fields=['is_active'])
                activated.append(role_name)
            elif created:
                activated.append(role_name)

        # ── Step 3: deactivate roles no longer needed ───────────────────────
        # Fetch all active CollegeRoles whose role name is NOT in required set
        active_college_roles = (
            CollegeRole.objects
            .filter(college=college, is_active=True)
            .select_related('role')
        )
        for cr in active_college_roles:
            if cr.role.name.upper() not in required_role_names:
                cr.is_active = False
                cr.save(update_fields=['is_active'])
                deactivated.append(cr.role.name.upper())

    return {'activated': activated, 'deactivated': deactivated}
