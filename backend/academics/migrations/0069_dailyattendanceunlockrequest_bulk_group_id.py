from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0068_merge_20260313_1122'),
    ]

    operations = [
        migrations.AddField(
            model_name='dailyattendanceunlockrequest',
            name='bulk_group_id',
            field=models.UUIDField(
                blank=True,
                db_index=True,
                null=True,
                help_text='Groups multiple session requests submitted together as a single bulk request',
            ),
        ),
    ]
