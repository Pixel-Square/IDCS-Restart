from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0045_alter_labpublishedsheet_assessment'),
    ]

    operations = [
        migrations.AddField(
            model_name='obedueschedule',
            name='open_from',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
