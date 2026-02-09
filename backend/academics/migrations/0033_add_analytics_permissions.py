# Generated migration for analytics permissions

from django.db import migrations


def create_analytics_permissions(apps, schema_editor):
    """Create analytics permissions"""
    Permission = apps.get_model('accounts', 'Permission')
    
    permissions = [
        {
            'code': 'analytics.view_all_analytics',
            'description': 'Can view attendance analytics for all departments, classes, and students'
        },
        {
            'code': 'analytics.view_department_analytics',
            'description': 'Can view attendance analytics for own department classes and students'
        },
        {
            'code': 'analytics.view_class_analytics',
            'description': 'Can view attendance analytics for own class students'
        },
    ]
    
    for perm_data in permissions:
        Permission.objects.get_or_create(
            code=perm_data['code'],
            defaults={
                'description': perm_data['description']
            }
        )


def remove_analytics_permissions(apps, schema_editor):
    """Remove analytics permissions"""
    Permission = apps.get_model('accounts', 'Permission')
    Permission.objects.filter(code__startswith='analytics.').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0032_department_short_name'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_analytics_permissions, remove_analytics_permissions),
    ]
