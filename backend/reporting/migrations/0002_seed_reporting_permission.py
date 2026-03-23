from django.db import migrations


PERM_CODE = 'reporting.view_powerbi_data'
PERM_DESC = 'Can view Power BI reporting exports and APIs'


def seed_permission(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Permission.objects.get_or_create(code=PERM_CODE, defaults={'description': PERM_DESC})


def unseed_permission(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Permission.objects.filter(code=PERM_CODE).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('reporting', '0001_powerbi_reporting_views'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_permission, unseed_permission),
    ]
