# Generated migration for adding order field to AcV2QpPattern

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0009_acv2qptype_class_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='acv2qppattern',
            name='order',
            field=models.IntegerField(db_index=True, default=0),
        ),
    ]
