from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff_attendance', '0015_rename_staff_biome_user_id_16fc4d_idx_staff_biome_user_id_04f2e6_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancesettings',
            name='lunch_from',
            field=models.TimeField(blank=True, help_text='Optional lunch break start time', null=True),
        ),
        migrations.AddField(
            model_name='attendancesettings',
            name='lunch_to',
            field=models.TimeField(blank=True, help_text='Optional lunch break end time', null=True),
        ),
        migrations.AddField(
            model_name='departmentattendancesettings',
            name='lunch_from',
            field=models.TimeField(blank=True, help_text='Optional lunch break start time', null=True),
        ),
        migrations.AddField(
            model_name='departmentattendancesettings',
            name='lunch_to',
            field=models.TimeField(blank=True, help_text='Optional lunch break end time', null=True),
        ),
        migrations.AddField(
            model_name='specialdepartmentdateattendancelimit',
            name='lunch_from',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='specialdepartmentdateattendancelimit',
            name='lunch_to',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='staffattendancetimelimitoverride',
            name='lunch_from',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='staffattendancetimelimitoverride',
            name='lunch_to',
            field=models.TimeField(blank=True, null=True),
        ),
    ]
