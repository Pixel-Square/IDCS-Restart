from django.db import migrations

HOSTEL_ROLES = [
    ('COLLEGE_ADMIN', 'College-wide administrator with access to all modules.'),
    ('HOSTEL_ADMIN', 'Manages hostel buildings, rooms, allocations and hostel operations.'),
    ('WARDEN', 'Responsible for one or more hostel buildings.'),
    ('DEPUTY_WARDEN', 'Assists a warden for an assigned hostel building.'),
    ('MATRON', 'Hostel matron responsible for resident welfare.'),
    ('MAINTENANCE_STAFF', 'Handles hostel complaints and maintenance work.'),
    ('MESS_COORDINATOR', 'Manages mess menus, feedback and mess requests.'),
    ('TRANSPORT_COORDINATOR', 'Manages college bus routes and transport assignments.'),
    ('SECURITY_STAFF', 'Records visitors, late entries and student movement.'),
]


def seed_hostel_roles(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    for name, description in HOSTEL_ROLES:
        Role.objects.get_or_create(name=name, defaults={'description': description})


def remove_hostel_roles(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Role.objects.filter(name__in=[name for name, _ in HOSTEL_ROLES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('hostel', '0001_initial'),
        ('accounts', '0036_add_discipline_roles_and_permissions'),
    ]

    operations = [
        migrations.RunPython(seed_hostel_roles, remove_hostel_roles),
    ]
