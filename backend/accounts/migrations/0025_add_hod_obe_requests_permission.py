from django.db import migrations


PERM_CODE = 'obe.hod_obe_requests'
PERM_DESC = 'HOD: OBE Requests (sidebar visibility)'


def create_perm_and_assign(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    perm, _ = Permission.objects.get_or_create(code=PERM_CODE, defaults={'description': PERM_DESC})

    # Assign to HOD role if present
    hod = Role.objects.filter(name__iexact='HOD').first()
    if hod:
        RolePermission.objects.get_or_create(role=hod, permission=perm)


def remove_perm_and_unassign(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    perm = Permission.objects.filter(code=PERM_CODE).first()
    if not perm:
        return

    # remove any role assignments for this permission
    RolePermission.objects.filter(permission=perm).delete()
    perm.delete()


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0024_user_email_unique_login'),
    ]

    operations = [
        migrations.RunPython(create_perm_and_assign, remove_perm_and_unassign),
    ]
