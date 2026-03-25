from django.db import migrations


PERM_CODE = 'obe.master_obe_requests'
PERM_DESC = 'OBE: Master Requests (sidebar visibility and access)'
SOURCE_PERM_CODE = 'obe.master.manage'


def create_perm_and_assign(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    target_perm, _ = Permission.objects.get_or_create(
        code=PERM_CODE,
        defaults={'description': PERM_DESC},
    )

    # Mirror current master-manage role mappings to the new requests-specific permission.
    source_perm = Permission.objects.filter(code=SOURCE_PERM_CODE).first()
    if not source_perm:
        return

    role_ids = RolePermission.objects.filter(permission=source_perm).values_list('role_id', flat=True)
    for role_id in role_ids:
        RolePermission.objects.get_or_create(role_id=role_id, permission=target_perm)


def remove_perm_and_unassign(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    perm = Permission.objects.filter(code=PERM_CODE).first()
    if not perm:
        return

    RolePermission.objects.filter(permission=perm).delete()
    perm.delete()


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0025_add_hod_obe_requests_permission'),
    ]

    operations = [
        migrations.RunPython(create_perm_and_assign, remove_perm_and_unassign),
    ]
