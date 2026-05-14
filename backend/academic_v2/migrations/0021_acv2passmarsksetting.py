import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0020_add_order_to_cycle'),
    ]

    operations = [
        migrations.CreateModel(
            name='AcV2PassMarkSetting',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('out_of', models.IntegerField(default=100, help_text='Total marks (denominator)')),
                ('pass_mark', models.IntegerField(default=50, help_text='Minimum marks to pass')),
                ('label', models.CharField(default='Default', help_text='Label for this setting', max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Pass Mark Setting',
                'verbose_name_plural': 'Pass Mark Settings',
                'db_table': 'acv2_pass_mark_setting',
                'ordering': ['out_of'],
            },
        ),
    ]
