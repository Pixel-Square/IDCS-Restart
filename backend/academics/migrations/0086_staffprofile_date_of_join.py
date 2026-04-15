from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0085_add_internal_external_ids'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffprofile',
            name='date_of_join',
            field=models.DateField(blank=True, help_text='Date of joining', null=True),
        ),
    ]
