from django.db import migrations


def add_principal_feedback_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # Reuse the same additive/idempotent pattern used by existing role-permission mappings.
    principal_role = Role.objects.filter(name__iexact='PRINCIPAL').first()
    if principal_role is None:
        principal_role = Role.objects.create(
            name='PRINCIPAL',
            description='Principal role',
        )

    permissions_to_ensure = {
        'feedback.principal_feedback_page': 'Principal feedback page access',
        'feedback.principal_create': 'Principal can create institutional feedback',
        'feedback.principal_analytics': 'Principal can view feedback analytics',
        # Existing permission needed for module visibility in menu.
        'feedback.feedback_page': 'View feedback page',
    }

    permissions_by_code = {}
    for code, description in permissions_to_ensure.items():
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'description': description},
        )
        permissions_by_code[code] = perm

    for code in (
        'feedback.principal_feedback_page',
        'feedback.principal_create',
        'feedback.principal_analytics',
        'feedback.feedback_page',
    ):
        RolePermission.objects.get_or_create(
            role=principal_role,
            permission=permissions_by_code[code],
        )


def noop_reverse(apps, schema_editor):
    # Intentionally do nothing to avoid removing existing live mappings on rollback.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0017_merge_20260312_1546'),
    ]

    operations = [
        migrations.RunPython(add_principal_feedback_permissions, noop_reverse),
    ]
