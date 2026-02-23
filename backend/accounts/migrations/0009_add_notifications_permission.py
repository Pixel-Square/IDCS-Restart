from django.db import migrations


NOTIFICATIONS_PERMISSION = ('notifications.manage', 'NOTIFICATIONS_MANAGE')


def add_notifications_permission(apps, schema_editor):
    """
    Create notifications.manage permission and assign it to IQAC role only.
    """
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # Create the permission
    perm, created = Permission.objects.get_or_create(
        code=NOTIFICATIONS_PERMISSION[0],
        defaults={'description': NOTIFICATIONS_PERMISSION[1]}
    )

    # Assign to IQAC role only
    try:
        iqac_role = Role.objects.get(name__iexact='IQAC')
        RolePermission.objects.get_or_create(role=iqac_role, permission=perm)
    except Role.DoesNotExist:
        # IQAC role doesn't exist yet, skip assignment
        pass


def remove_notifications_permission(apps, schema_editor):
    """
    Remove notifications.manage permission and its role assignments.
    """
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    try:
        perm = Permission.objects.get(code=NOTIFICATIONS_PERMISSION[0])
        # Delete all role permissions first
        RolePermission.objects.filter(permission=perm).delete()
        # Delete the permission itself
        perm.delete()
    except Permission.DoesNotExist:
        pass


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0008_mobileotp'),
    ]

    operations = [
        migrations.RunPython(add_notifications_permission, remove_notifications_permission),
    ]
