from django.db import migrations


def add_hod_teaching_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    hod_role, _ = Role.objects.get_or_create(name='HOD')

    perms = [
        'academics.assign_teaching',
        'academics.change_teaching',
        'academics.delete_teaching',
    ]

    for code in perms:
        perm, _ = Permission.objects.get_or_create(code=code, defaults={'description': 'Auto-added teaching permission'})
        RolePermission.objects.get_or_create(role=hod_role, permission=perm)


def remove_hod_teaching_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    try:
        hod_role = Role.objects.get(name='HOD')
    except Role.DoesNotExist:
        return

    perms = ['academics.assign_teaching', 'academics.change_teaching', 'academics.delete_teaching']
    for code in perms:
        try:
            perm = Permission.objects.get(code=code)
        except Permission.DoesNotExist:
            continue
        RolePermission.objects.filter(role=hod_role, permission=perm).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_add_hod_advisor_permissions'),
    ]

    operations = [
        migrations.RunPython(add_hod_teaching_permissions, remove_hod_teaching_permissions),
    ]
