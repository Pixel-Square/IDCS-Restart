from django.db import migrations


def add_hod_advisor_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    hod_role, _ = Role.objects.get_or_create(name='HOD')

    perms = [
        'academics.assign_advisor',
        'academics.change_sectionadvisor',
        'academics.delete_sectionadvisor',
    ]

    for code in perms:
        perm, _ = Permission.objects.get_or_create(code=code, defaults={'description': 'Auto-added permission'})
        # create mapping if not exists
        RolePermission.objects.get_or_create(role=hod_role, permission=perm)


def remove_hod_advisor_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    try:
        hod_role = Role.objects.get(name='HOD')
    except Role.DoesNotExist:
        return

    perms = ['academics.assign_advisor', 'academics.change_sectionadvisor', 'academics.delete_sectionadvisor']
    for code in perms:
        try:
            perm = Permission.objects.get(code=code)
        except Permission.DoesNotExist:
            continue
        RolePermission.objects.filter(role=hod_role, permission=perm).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(add_hod_advisor_permissions, remove_hod_advisor_permissions),
    ]
