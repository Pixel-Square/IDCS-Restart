# Generated migration for adding sheet_number field to CdapTemplate

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0072_cdap_template'),
    ]

    operations = [
        migrations.AddField(
            model_name='cdaptemplate',
            name='sheet_number',
            field=models.PositiveIntegerField(default=1),
        ),
    ]
