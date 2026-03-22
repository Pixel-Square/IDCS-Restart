# Generated migration for adding type2_pf_value field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff_salary', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffsalarydeclaration',
            name='type2_pf_value',
            field=models.FloatField(default=0.0, help_text='Type 2 PF value per staff (unique per employee)'),
        ),
    ]
