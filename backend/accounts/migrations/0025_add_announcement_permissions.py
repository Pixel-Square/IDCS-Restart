from django.db import migrations


PERMISSIONS = {
    'announcements.view_announcement_page': 'View announcements page',
    'announcements.create_announcement': 'Create announcements',
    'announcements.manage_announcement': 'Edit/delete announcements',
}

ROLE_MAPPING = {
    'STUDENT': ['announcements.view_announcement_page'],
    'STAFF': ['announcements.view_announcement_page', 'announcements.create_announcement'],
    'HOD': ['announcements.view_announcement_page', 'announcements.create_announcement'],
    'IQAC': ['announcements.view_announcement_page', 'announcements.create_announcement'],
    'PRINCIPAL': [
        'announcements.view_announcement_page',
        'announcements.create_announcement',
        'announcements.manage_announcement',
    ],
}


def add_announcement_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    permissions_by_code = {}
    for code, description in PERMISSIONS.items():
        perm, _ = Permission.objects.get_or_create(code=code, defaults={'description': description})
        permissions_by_code[code] = perm

    for role_name, perm_codes in ROLE_MAPPING.items():
        role = Role.objects.filter(name__iexact=role_name).first()
        if role is None:
            continue
        for code in perm_codes:
            perm = permissions_by_code.get(code)
            if perm is None:
                continue
            RolePermission.objects.get_or_create(role=role, permission=perm)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0024_user_email_unique_login'),
    ]

    operations = [
        migrations.RunPython(add_announcement_permissions, noop_reverse),
    ]
