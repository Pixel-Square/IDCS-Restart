from django.db import migrations


def add_feedback_permissions(apps, schema_editor):
    """Add feedback permissions and map them to roles."""
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # Create permissions
    feedback_perms = {
        'FEEDBACK.FEEDBACK_PAGE': 'View feedback page',
        'FEEDBACK.CREATE': 'Create feedback forms (HOD)',
        'FEEDBACK.REPLY': 'Reply to feedback (Staff & Students)',
    }

    for code, description in feedback_perms.items():
        Permission.objects.get_or_create(
            code=code,
            defaults={'description': description}
        )

    # Map permissions to roles
    role_permission_mapping = {
        'HOD': ['FEEDBACK.FEEDBACK_PAGE', 'FEEDBACK.CREATE'],
        'STAFF': ['FEEDBACK.FEEDBACK_PAGE', 'FEEDBACK.REPLY'],
        'STUDENT': ['FEEDBACK.FEEDBACK_PAGE', 'FEEDBACK.REPLY'],
    }

    for role_name, perm_codes in role_permission_mapping.items():
        try:
            role = Role.objects.get(name=role_name)
            for perm_code in perm_codes:
                perm = Permission.objects.get(code=perm_code)
                RolePermission.objects.get_or_create(role=role, permission=perm)
        except Role.DoesNotExist:
            # Role doesn't exist, skip
            pass


def remove_feedback_permissions(apps, schema_editor):
    """Remove feedback permissions."""
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    feedback_perm_codes = [
        'FEEDBACK.FEEDBACK_PAGE',
        'FEEDBACK.CREATE',
        'FEEDBACK.REPLY',
    ]

    for perm_code in feedback_perm_codes:
        try:
            perm = Permission.objects.get(code=perm_code)
            # Delete all role-permission mappings for this permission
            RolePermission.objects.filter(permission=perm).delete()
            # Optionally delete the permission itself
            # perm.delete()
        except Permission.DoesNotExist:
            continue


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0013_username_not_unique'),
    ]

    operations = [
        migrations.RunPython(add_feedback_permissions, remove_feedback_permissions),
    ]
