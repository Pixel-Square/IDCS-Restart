# Generated migration for students permissions

from django.db import migrations


def create_students_permissions(apps, schema_editor):
    """Create students view permissions"""
    Permission = apps.get_model('accounts', 'Permission')
    
    permissions = [
        {
            'code': 'students.view_students',
            'description': 'Can access the students page'
        },
        {
            'code': 'students.view_all_students',
            'description': 'Can view students from all departments and sections'
        },
        {
            'code': 'students.view_department_students',
            'description': 'Can view students from own department'
        },
    ]
    
    for perm_data in permissions:
        Permission.objects.get_or_create(
            code=perm_data['code'],
            defaults={
                'description': perm_data['description']
            }
        )


def remove_students_permissions(apps, schema_editor):
    """Remove students permissions"""
    Permission = apps.get_model('accounts', 'Permission')
    Permission.objects.filter(code__startswith='students.').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0033_add_analytics_permissions'),
    ]

    operations = [
        migrations.RunPython(create_students_permissions, remove_students_permissions),
    ]