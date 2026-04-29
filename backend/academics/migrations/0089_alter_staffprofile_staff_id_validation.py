from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0088_staffprofile_personal_email'),
    ]

    operations = [
        migrations.AlterField(
            model_name='staffprofile',
            name='staff_id',
            field=models.CharField(
                db_index=True,
                help_text='Staff ID (format not restricted).',
                max_length=64,
                unique=True,
            ),
        ),
    ]
