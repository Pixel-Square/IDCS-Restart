from django.db import migrations


def create_obe_permissions(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    perms = [
        ('obe.view', 'OBE_VIEW'),
        ('obe.cdap.upload', 'OBE_CDAP_UPLOAD'),
        ('obe.master.manage', 'OBE_MASTER_MANAGE'),
    ]
    for code, desc in perms:
        Permission.objects.get_or_create(code=code, defaults={'description': desc})


def remove_obe_permissions(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Permission.objects.filter(code__in=['obe.view', 'obe.cdap.upload', 'obe.master.manage']).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_obe_permissions, remove_obe_permissions),
    ]
