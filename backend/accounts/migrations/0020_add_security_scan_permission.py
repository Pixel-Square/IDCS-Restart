from django.db import migrations


def forwards(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    security_role, _ = Role.objects.get_or_create(
        name='SECURITY',
        defaults={'description': 'Security staff role'},
    )

    scan_perm, _ = Permission.objects.get_or_create(
        code='idcsscan.scan',
        defaults={'description': 'Can use IDCS scan endpoints'},
    )

    RolePermission.objects.get_or_create(role=security_role, permission=scan_perm)


def backwards(apps, schema_editor):
    # No-op: do not delete roles/permissions on rollback.
    return


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0019_merge_20260314_1954'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
