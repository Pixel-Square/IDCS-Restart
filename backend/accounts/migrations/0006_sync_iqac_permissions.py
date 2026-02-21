from django.db import migrations


def sync_iqac_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    try:
        haa = Role.objects.filter(name__iexact='HAA').first()
        iqac = Role.objects.filter(name__iexact='IQAC').first()
    except Exception:
        return

    if not haa or not iqac:
        return

    # Copy all permissions from HAA to IQAC (idempotent)
    perms = Permission.objects.filter(permission_roles__role=haa).distinct()
    for p in perms:
        RolePermission.objects.get_or_create(role=iqac, permission=p)


def unsync_iqac_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    try:
        haa = Role.objects.filter(name__iexact='HAA').first()
        iqac = Role.objects.filter(name__iexact='IQAC').first()
    except Exception:
        return

    if not haa or not iqac:
        return

    # Remove permissions on rollback that are present on IQAC and also present on HAA
    perms = Permission.objects.filter(permission_roles__role=haa).distinct()
    for p in perms:
        RolePermission.objects.filter(role=iqac, permission=p).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_merge_20260211_2217'),
    ]

    operations = [
        migrations.RunPython(sync_iqac_permissions, unsync_iqac_permissions),
    ]
