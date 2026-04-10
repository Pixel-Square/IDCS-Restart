from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff_attendance', '0016_add_lunch_time_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancesettings',
            name='essl_skip_minutes',
            field=models.PositiveIntegerField(
                default=30,
                help_text='Minimum minutes after first biometric punch before mapping a second punch as OUT',
            ),
        ),
    ]
