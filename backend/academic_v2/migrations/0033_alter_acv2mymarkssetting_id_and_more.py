# Rewritten: drop and recreate the table with UUID primary key.
# The table was just created in 0032 with BigAutoField and is always empty at this point.

from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0032_add_my_marks_setting'),
    ]

    operations = [
        migrations.RunSQL(
            sql='DROP TABLE IF EXISTS acv2_my_marks_setting;',
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.CreateModel(
            name='AcV2MyMarksSetting',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('key', models.CharField(default='DEFAULT', max_length=40, unique=True)),
                ('viewing_enabled', models.BooleanField(default=False)),
                ('require_profile_photo', models.BooleanField(default=False)),
                ('require_mobile_number', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'My Marks Setting',
                'verbose_name_plural': 'My Marks Settings',
                'db_table': 'acv2_my_marks_setting',
            },
        ),
    ]
