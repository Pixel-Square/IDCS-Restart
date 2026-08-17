from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0021_acv2passmarsksetting'),
    ]

    operations = [
        migrations.AddField(
            model_name='acv2classtype',
            name='cqi_global_custom_vars',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
