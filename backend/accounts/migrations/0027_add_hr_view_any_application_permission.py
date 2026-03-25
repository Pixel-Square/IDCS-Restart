from django.db import migrations


PERM_CODE = 'applications.view_any_application'
PERM_DESC = 'Applications: View any application (HR override)'


def forwards(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    hr_role, _ = Role.objects.get_or_create(
        name='HR',
        defaults={'description': 'Human resources role'},
    )

    view_any_perm, _ = Permission.objects.get_or_create(
        code=PERM_CODE,
        defaults={'description': PERM_DESC},
    )

    RolePermission.objects.get_or_create(role=hr_role, permission=view_any_perm)


def backwards(apps, schema_editor):
    # No-op: do not delete roles/permissions on rollback.
    return


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0026_add_master_obe_requests_permission'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
