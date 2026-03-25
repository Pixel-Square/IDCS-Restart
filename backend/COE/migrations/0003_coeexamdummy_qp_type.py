from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('COE', '0002_coeexamdummy'),
    ]

    operations = [
        migrations.AddField(
            model_name='coeexamdummy',
            name='qp_type',
            field=models.CharField(default='QP1', max_length=16),
        ),
    ]
