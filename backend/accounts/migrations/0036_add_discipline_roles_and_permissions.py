# Generated migration to seed Discipline Committee & DisciplineCommitteeAdmin roles and role permissions
from django.db import migrations

DISCIPLINE_PERMISSIONS = [
    ("discipline.view_admin", "View Discipline Committee admin dashboard and student barcodes"),
    ("discipline.manage_config", "Configure Discipline categories, rules and semester mappings"),
    ("discipline.view_logs", "View Discipline incident logs and audits"),
    ("discipline.log_incident", "Log and record student discipline incidents"),
]


def add_discipline_roles_and_permissions(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    # 1. Create permissions
    perm_objs = {}
    for code, description in DISCIPLINE_PERMISSIONS:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'description': description}
        )
        perm_objs[code] = perm

    # 2. Roles to create/update
    # Admin roles
    admin_roles = ['DisciplineCommitteeAdmin', 'DISCIPLINE_COMMITTEE_ADMIN']
    for rname in admin_roles:
        role, _ = Role.objects.get_or_create(
            name=rname,
            defaults={'description': 'Discipline Committee Administrator — manage rules, barcodes, and audit logs'}
        )
        for perm in perm_objs.values():
            RolePermission.objects.get_or_create(role=role, permission=perm)

    # Member / Staff roles
    staff_roles = ['Discipline Committee', 'DISCIPLINE_COMMITTEE', 'STAFF', 'FACULTY']
    for rname in staff_roles:
        role, _ = Role.objects.get_or_create(
            name=rname,
            defaults={'description': 'Staff Member — log student violations and view records'}
        )
        for code in ['discipline.log_incident', 'discipline.view_logs', 'discipline.view_admin']:
            if code in perm_objs:
                RolePermission.objects.get_or_create(role=role, permission=perm_objs[code])


def remove_discipline_roles_and_permissions(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    codes = [code for code, _ in DISCIPLINE_PERMISSIONS]
    RolePermission.objects.filter(permission__code__in=codes).delete()
    Permission.objects.filter(code__in=codes).delete()
    Role.objects.filter(name__in=[
        'Discipline Committee', 'DISCIPLINE_COMMITTEE',
        'DisciplineCommitteeAdmin', 'DISCIPLINE_COMMITTEE_ADMIN'
    ]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0035_remove_siteconfiguration_app_conditions_and_more'),
    ]

    operations = [
        migrations.RunPython(
            add_discipline_roles_and_permissions,
            remove_discipline_roles_and_permissions
        ),
    ]
