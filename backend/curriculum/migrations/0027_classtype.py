# Generated migration for ClassType model

from django.db import migrations, models


def seed_class_types(apps, schema_editor):
    """Seed initial class types from hardcoded constants."""
    ClassType = apps.get_model('curriculum', 'ClassType')
    
    initial_types = [
        ('THEORY', 'Theory', 1),
        ('THEORY_PMBL', 'Theory (PMBL)', 2),
        ('LAB', 'Lab', 3),
        ('PURE_LAB', 'Pure Lab', 4),
        ('TCPL', 'Tcpl', 5),
        ('TCPR', 'Tcpr', 6),
        ('PRACTICAL', 'Practical', 7),
        ('PRBL', 'PRBL', 8),
        ('PROJECT', 'Project', 9),
        ('AUDIT', 'Audit', 10),
        ('SPECIAL', 'Special', 11),
    ]
    
    for code, label, sort_order in initial_types:
        ClassType.objects.get_or_create(
            code=code,
            defaults={
                'label': label,
                'sort_order': sort_order,
                'is_active': True,
            }
        )


def reverse_seed(apps, schema_editor):
    """Remove seeded class types."""
    ClassType = apps.get_model('curriculum', 'ClassType')
    ClassType.objects.filter(code__in=[
        'THEORY', 'THEORY_PMBL', 'LAB', 'PURE_LAB', 'TCPL', 'TCPR',
        'PRACTICAL', 'PRBL', 'PROJECT', 'AUDIT', 'SPECIAL'
    ]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0026_alter_curriculumdepartment_class_type_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClassType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=32, unique=True)),
                ('label', models.CharField(max_length=64)),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.PositiveSmallIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Class Type',
                'verbose_name_plural': 'Class Types',
                'ordering': ('sort_order', 'code'),
            },
        ),
        migrations.RunPython(seed_class_types, reverse_seed),
    ]
