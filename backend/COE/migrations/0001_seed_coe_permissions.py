from django.db import migrations


COE_PERMISSIONS = [
    ('coe.portal.access', 'Access COE portal base'),
    ('coe.manage.exams', 'Manage exam operations in COE portal'),
    ('coe.manage.results', 'Manage result publication in COE portal'),
    ('coe.manage.circulars', 'Manage circulars in COE portal'),
    ('coe.manage.calendar', 'Manage academic calendar in COE portal'),
]


def seed_coe_permissions(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')

    for code, description in COE_PERMISSIONS:
        Permission.objects.get_or_create(code=code, defaults={'description': description})


def remove_coe_permissions(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    codes = [code for code, _ in COE_PERMISSIONS]
    Permission.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0018_user_name_email_edited'),
    ]

    operations = [
        migrations.RunPython(seed_coe_permissions, remove_coe_permissions),
    ]
