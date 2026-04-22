from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff_requests', '0012_vacation_settings_and_templates'),
    ]

    operations = [
        migrations.AddField(
            model_name='vacationentitlementrule',
            name='condition',
            field=models.CharField(
                choices=[('>', '>'), ('<', '<'), ('=', '='), ('>=', '>='), ('<=', '<=')],
                default='>=',
                max_length=2,
            ),
        ),
        migrations.AlterUniqueTogether(
            name='vacationentitlementrule',
            unique_together={('condition', 'min_years', 'min_months')},
        ),
        migrations.AddField(
            model_name='vacationslot',
            name='semester_from_date',
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='vacationslot',
            name='semester_to_date',
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
    ]
