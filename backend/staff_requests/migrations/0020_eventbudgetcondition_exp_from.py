from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff_requests', '0019_eventattendingform_custom_event_details_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='eventbudgetcondition',
            name='exp_from',
            field=models.FloatField(
                null=True,
                blank=True,
                default=None,
                help_text=(
                    'Optional lower-bound experience threshold in years (inclusive). '
                    'E.g. exp_from=5, exp_condition=\'<\', exp_value=8 means: '
                    '5 years <= experience < 8 years.'
                ),
            ),
        ),
    ]
