from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0036_rename_obe_assessctrl_sem_assess_idx_obe_obeasse_semeste_beb9cd_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ObeCqiConfig',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('options', models.JSONField(default=list)),
                ('divider', models.FloatField(default=2.0)),
                ('multiplier', models.FloatField(default=0.15)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'obe_cqi_config',
            },
        ),
    ]
