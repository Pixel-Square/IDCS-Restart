from django.db import migrations


PERMISSIONS = [
    ('certificates.upload', 'Upload certificates'),
    ('certificates.review', 'Review certificates'),
    ('certificates.view_mentee_achievements', 'View mentee achievements'),
    ('certificates.view_advisee_achievements', 'View advisee achievements'),
    ('certificates.view_department_achievements', 'View department achievements'),
    ('certificates.view_all_achievements', 'View all achievements'),
    ('certificates.export_reports', 'Export certificate reports'),
]


def forwards(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    perms = {}
    for code, desc in PERMISSIONS:
        perm, _ = Permission.objects.get_or_create(code=code, defaults={'description': desc})
        perms[code] = perm

    role_map = {
        'STUDENT': ['certificates.upload'],
        'MENTOR': ['certificates.review', 'certificates.view_mentee_achievements'],
        'ADVISOR': ['certificates.view_advisee_achievements'],
        'HOD': ['certificates.view_department_achievements'],
        'IQAC': ['certificates.view_all_achievements', 'certificates.export_reports'],
    }

    for role_name, codes in role_map.items():
        role = Role.objects.filter(name=role_name).first()
        if not role:
            continue
        for code in codes:
            RolePermission.objects.get_or_create(role=role, permission=perms[code])


def backwards(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')
    for code, _ in PERMISSIONS:
        perm = Permission.objects.filter(code=code).first()
        if perm:
            RolePermission.objects.filter(permission=perm).delete()
            perm.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('certificates', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
