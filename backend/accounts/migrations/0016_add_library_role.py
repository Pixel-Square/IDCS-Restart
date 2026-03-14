from django.db import migrations


def add_library_role(apps, schema_editor):
    """Create LIBRARY role and add permission for Assign Cards page."""
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # Create or get LIBRARY role
    library_role, created = Role.objects.get_or_create(
        name='LIBRARY',
        defaults={'description': 'Library Staff - RFID Card Assignment'}
    )
    if created:
        print(f'Created LIBRARY role')

    # Create permission for RFID card assignment
    assign_cards_perm, perm_created = Permission.objects.get_or_create(
        code='idscan.assign_cards',
        defaults={'description': 'Can access RFID Card Assignment page'}
    )
    if perm_created:
        print(f'Created idscan.assign_cards permission')

    # Map permission to LIBRARY role
    RolePermission.objects.get_or_create(
        role=library_role,
        permission=assign_cards_perm
    )
    print(f'Assigned idscan.assign_cards permission to LIBRARY role')


def remove_library_role(apps, schema_editor):
    """Remove LIBRARY role and related permissions."""
    Role = apps.get_model('accounts', 'Role')
    try:
        library_role = Role.objects.get(name='LIBRARY')
        library_role.delete()
        print('Deleted LIBRARY role')
    except Role.DoesNotExist:
        pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0015_fix_feedback_permissions_lowercase'),
    ]

    operations = [
        migrations.RunPython(
            add_library_role,
            remove_library_role
        ),
    ]
