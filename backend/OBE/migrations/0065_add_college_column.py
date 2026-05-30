# Generated migration to add college column

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0064_add_question_type_column'),
    ]

    operations = [
        migrations.AddField(
            model_name='coursequestionbank',
            name='college',
            field=models.CharField(
                max_length=10,
                blank=True,
                null=True,
                help_text='College: KRCT, KRCE, MKCE'
            ),
        ),
    ]
