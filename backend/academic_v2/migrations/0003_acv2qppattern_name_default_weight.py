from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0002_seed_permissions'),
    ]

    operations = [
        migrations.AddField(
            model_name='acv2qppattern',
            name='name',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='acv2qppattern',
            name='default_weight',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
    ]
