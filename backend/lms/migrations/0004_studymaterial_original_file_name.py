from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lms', '0003_studymaterialdownloadlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='studymaterial',
            name='original_file_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
