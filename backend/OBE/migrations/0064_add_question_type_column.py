# Generated migration to add question_type column

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0063_coursequestionbanklog_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='coursequestionbank',
            name='question_type',
            field=models.CharField(
                max_length=1, 
                choices=[('D', 'Descriptive'), ('O', 'Objective')], 
                default='D', 
                help_text='D=Descriptive, O=Objective'
            ),
        ),
    ]
