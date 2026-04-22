from django.db import migrations


LEGACY_PERMISSION_CODE = 'reporting.view_powerbi_data'


def remove_legacy_permission(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Permission.objects.filter(code=LEGACY_PERMISSION_CODE).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('reporting', '0002_seed_reporting_permission'),
    ]

    operations = [
        migrations.RunPython(remove_legacy_permission, migrations.RunPython.noop),
    ]
