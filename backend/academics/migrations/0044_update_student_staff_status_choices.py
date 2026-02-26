# Generated migration for updating student and staff status choices

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0043_alter_staffprofile_status_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='studentprofile',
            name='status',
            field=models.CharField(
                choices=[
                    ('ACTIVE', 'Active'),
                    ('INACTIVE', 'Inactive'),
                    ('ALUMNI', 'Alumni'),
                    ('DEBAR', 'Debar')
                ],
                default='ACTIVE',
                max_length=16
            ),
        ),
        migrations.AlterField(
            model_name='staffprofile',
            name='status',
            field=models.CharField(
                choices=[
                    ('ACTIVE', 'Active'),
                    ('INACTIVE', 'Inactive'),
                    ('ALUMNI', 'Alumni'),
                    ('RESIGNED', 'Resigned')
                ],
                default='ACTIVE',
                max_length=16
            ),
        ),
    ]
