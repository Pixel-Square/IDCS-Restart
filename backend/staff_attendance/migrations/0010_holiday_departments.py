from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0061_merge_20260310_1159'),
        ('staff_attendance', '0009_alter_attendancerecord_an_status_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='holiday',
            name='departments',
            field=models.ManyToManyField(
                blank=True,
                help_text='If empty, holiday applies to all departments. Otherwise only selected departments observe it.',
                related_name='holidays',
                to='academics.department',
            ),
        ),
    ]
