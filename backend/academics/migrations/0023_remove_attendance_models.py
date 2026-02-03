from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0022_section_semester'),
    ]

    operations = [
        migrations.DeleteModel(
            name='AttendanceRecord',
        ),
        migrations.DeleteModel(
            name='AttendanceSession',
        ),
    ]
