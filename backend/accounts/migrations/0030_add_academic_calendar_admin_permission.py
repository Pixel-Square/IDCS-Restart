# Generated migration for adding academic_calendar.admin permission

from django.db import migrations


def add_academic_calendar_permission(apps, schema_editor):
    """Add academic_calendar.admin permission for IQAC role."""
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # Create the permission if it doesn't exist
    permission, created = Permission.objects.get_or_create(
        code='academic_calendar.admin',
        defaults={
            'description': 'Can access and manage Academic Calendar Admin page - upload/view/delete academic calendars'
        }
    )

    # Get existing IQAC role (case-insensitive) or create it
    iqac_role = Role.objects.filter(name__iexact='IQAC').first()
    if not iqac_role:
        iqac_role = Role.objects.create(
            name='IQAC',
            description='Internal Quality Assurance Cell'
        )

    # Assign permission to IQAC role
    RolePermission.objects.get_or_create(
        role=iqac_role,
        permission=permission
    )


def remove_academic_calendar_permission(apps, schema_editor):
    """Remove academic_calendar.admin permission."""
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    try:
        permission = Permission.objects.get(code='academic_calendar.admin')
        # Remove role permissions first
        RolePermission.objects.filter(permission=permission).delete()
        # Then remove the permission
        permission.delete()
    except Permission.DoesNotExist:
        pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0029_site_configuration'),
    ]

    operations = [
        migrations.RunPython(
            add_academic_calendar_permission,
            remove_academic_calendar_permission
        ),
    ]
