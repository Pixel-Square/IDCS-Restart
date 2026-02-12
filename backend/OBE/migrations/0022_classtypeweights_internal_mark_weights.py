from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0021_internal_mark_mapping'),
    ]

    operations = [
        migrations.AddField(
            model_name='classtypeweights',
            name='internal_mark_weights',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
