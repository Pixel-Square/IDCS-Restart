from django.db import migrations

PERMISSION_CODE = 'students.bulk_import'
PERMISSION_DESCRIPTION = 'Can bulk import and update student records'
SOURCE_PERMISSION_CODE = 'students.view_all_students'


def create_bulk_import_permission(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    permission, _ = Permission.objects.get_or_create(
        code=PERMISSION_CODE,
        defaults={'description': PERMISSION_DESCRIPTION},
    )

    # Preserve access for roles that already manage students from all
    # departments; plain staff accounts no longer qualify on their own.
    source = Permission.objects.filter(code=SOURCE_PERMISSION_CODE).first()
    if source is None:
        return

    role_ids = RolePermission.objects.filter(
        permission=source
    ).values_list('role_id', flat=True)
    for role_id in role_ids:
        RolePermission.objects.get_or_create(role_id=role_id, permission=permission)


def remove_bulk_import_permission(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Permission.objects.filter(code=PERMISSION_CODE).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0036_add_discipline_roles_and_permissions'),
        ('academics', '0105_batchyear_is_graduated_default'),
    ]

    operations = [
        migrations.RunPython(
            create_bulk_import_permission,
            remove_bulk_import_permission,
        ),
    ]
