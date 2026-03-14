from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0017_merge_20260312_1546'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='name_email_edited',
            field=models.BooleanField(default=False),
        ),
    ]
