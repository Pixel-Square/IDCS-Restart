from django.db import migrations


class Migration(migrations.Migration):
    # No-op: attendance model alterations removed because attendance models
    # are deleted from the codebase. Create a proper drop-table migration
    # if you want to remove DB tables.
    dependencies = [
        ('academics', '0024_day_attendance_models'),
    ]

    operations = []
