from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0023_bypass_session_log'),
    ]

    operations = [
        migrations.AddField(
            model_name='acv2bypasssession',
            name='share_max_uses',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='acv2bypasssession',
            name='share_use_count',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
