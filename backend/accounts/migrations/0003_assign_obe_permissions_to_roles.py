from django.db import migrations


OBE_PERMISSIONS = [
    ('obe.view', 'OBE_VIEW'),
    ('obe.cdap.upload', 'OBE_CDAP_UPLOAD'),
    ('obe.master.manage', 'OBE_MASTER_MANAGE'),
]


def assign_obe_permissions_to_roles(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # Ensure permissions exist (safe even if 0002 already ran)
    perms_by_code = {}
    for code, desc in OBE_PERMISSIONS:
        perm, _ = Permission.objects.get_or_create(code=code, defaults={'description': desc})
        perms_by_code[code] = perm

    # Default role assignments:
    # - Upload/View: typical staff/admin roles
    # - Master manage: IQAC-like/admin roles
    for role in Role.objects.all():
        role_name = (role.name or '').strip().upper()

        is_staff_like = role_name in {'STAFF', 'FACULTY', 'ADVISOR', 'HOD', 'ADMIN'}
        is_iqac_like = ('IQAC' in role_name) or (role_name == 'ADMIN')

        if is_staff_like:
            RolePermission.objects.get_or_create(role=role, permission=perms_by_code['obe.view'])
            RolePermission.objects.get_or_create(role=role, permission=perms_by_code['obe.cdap.upload'])

        if is_iqac_like:
            RolePermission.objects.get_or_create(role=role, permission=perms_by_code['obe.master.manage'])
            RolePermission.objects.get_or_create(role=role, permission=perms_by_code['obe.view'])


def unassign_obe_permissions_from_roles(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    perm_codes = [code for code, _ in OBE_PERMISSIONS]
    perms = {p.code: p for p in Permission.objects.filter(code__in=perm_codes)}

    for role in Role.objects.all():
        role_name = (role.name or '').strip().upper()

        is_staff_like = role_name in {'STAFF', 'FACULTY', 'ADVISOR', 'HOD', 'ADMIN'}
        is_iqac_like = ('IQAC' in role_name) or (role_name == 'ADMIN')

        if is_staff_like:
            for code in ('obe.view', 'obe.cdap.upload'):
                perm = perms.get(code)
                if perm:
                    RolePermission.objects.filter(role=role, permission=perm).delete()

        if is_iqac_like:
            for code in ('obe.master.manage', 'obe.view'):
                perm = perms.get(code)
                if perm:
                    RolePermission.objects.filter(role=role, permission=perm).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_add_obe_permissions'),
    ]

    operations = [
        migrations.RunPython(assign_obe_permissions_to_roles, unassign_obe_permissions_from_roles),
    ]
