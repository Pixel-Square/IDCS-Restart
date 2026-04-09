from django.db import migrations


PERMISSIONS = [
    ('lms.page.staff', 'LMS page access for staff users'),
    ('lms.page.student', 'LMS page access for student users'),
    ('lms.page.hod', 'LMS page access for HOD users'),
    ('lms.page.ahod', 'LMS page access for AHOD users'),
    ('lms.page.iqac', 'LMS page access for IQAC users'),
    ('lms.materials.manage_own', 'Create, update and delete own LMS materials'),
    ('lms.materials.view_student', 'View LMS materials mapped to student courses'),
    ('lms.materials.view_department', 'View LMS materials in managed departments'),
    ('lms.materials.view_all', 'View LMS materials across all departments'),
    ('lms.quota.manage', 'Manage LMS storage quota allocations for staff'),
]

ROLE_PERMISSIONS = {
    'STAFF': ['lms.page.staff', 'lms.materials.manage_own'],
    'FACULTY': ['lms.page.staff', 'lms.materials.manage_own'],
    'STUDENT': ['lms.page.student', 'lms.materials.view_student'],
    'HOD': ['lms.page.hod', 'lms.materials.view_department'],
    'AHOD': ['lms.page.ahod', 'lms.materials.view_department'],
    'IQAC': ['lms.page.iqac', 'lms.materials.view_all', 'lms.quota.manage'],
}


def seed_lms_permissions(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    perm_map = {}
    for code, description in PERMISSIONS:
        perm_obj, _ = Permission.objects.get_or_create(code=code, defaults={'description': description})
        if not (perm_obj.description or '').strip() and description:
            perm_obj.description = description
            perm_obj.save(update_fields=['description'])
        perm_map[code] = perm_obj

    for role_name, codes in ROLE_PERMISSIONS.items():
        role = Role.objects.filter(name__iexact=role_name).first()
        if role is None:
            continue
        for code in codes:
            perm_obj = perm_map.get(code)
            if perm_obj is None:
                continue
            RolePermission.objects.get_or_create(role=role, permission=perm_obj)


def unseed_lms_permissions(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    codes = [code for code, _ in PERMISSIONS]
    perms = Permission.objects.filter(code__in=codes)
    RolePermission.objects.filter(permission__in=perms).delete()
    perms.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('lms', '0001_initial'),
        ('accounts', '0024_user_email_unique_login'),
    ]

    operations = [
        migrations.RunPython(seed_lms_permissions, unseed_lms_permissions),
    ]
