from django.db import migrations


# PS role permissions for staff attendance management
PS_PERMISSIONS = [
    ('staff_attendance.upload_csv', 'Upload staff attendance CSV files'),
    ('staff_attendance.view_attendance_records', 'View staff attendance records'),
    ('staff_attendance.view_upload_logs', 'View staff attendance upload logs'),
    ('staff_attendance.manage_attendance', 'Manage staff attendance system'),
]


def add_ps_permissions(apps, schema_editor):
    """
    Create PS (Principal Secretary) permissions for staff attendance management.
    """
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # Create PS role if it doesn't exist
    ps_role, role_created = Role.objects.get_or_create(
        name='PS',
        defaults={'description': 'Principal Secretary - manages staff attendance and administrative tasks'}
    )

    # Create permissions
    for perm_code, perm_desc in PS_PERMISSIONS:
        perm, created = Permission.objects.get_or_create(
            code=perm_code,
            defaults={'description': perm_desc}
        )
        
        # Assign to PS role
        RolePermission.objects.get_or_create(role=ps_role, permission=perm)

    # Also assign some basic permissions that PS might need
    basic_permissions = [
        'accounts.view_user',
        'academics.view_staffprofile',
    ]
    
    for perm_code in basic_permissions:
        try:
            perm = Permission.objects.get(code=perm_code)
            RolePermission.objects.get_or_create(role=ps_role, permission=perm)
        except Permission.DoesNotExist:
            # Permission doesn't exist, skip it
            pass


def remove_ps_permissions(apps, schema_editor):
    """
    Remove PS permissions and role assignments.
    """
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # Remove all PS-specific permissions
    for perm_code, _ in PS_PERMISSIONS:
        try:
            perm = Permission.objects.get(code=perm_code)
            # Delete all role permissions first
            RolePermission.objects.filter(permission=perm).delete()
            # Delete the permission itself
            perm.delete()
        except Permission.DoesNotExist:
            pass


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0013_username_not_unique'),
    ]

    operations = [
        migrations.RunPython(add_ps_permissions, remove_ps_permissions),
    ]