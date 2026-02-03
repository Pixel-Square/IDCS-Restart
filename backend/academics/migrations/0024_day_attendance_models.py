from django.db import migrations


class Migration(migrations.Migration):
    # Attendance-related migration replaced with a no-op because attendance
    # models have been removed from the codebase. If you want to drop the
    # corresponding DB tables, create and run an appropriate migration.
    dependencies = [
        ('academics', '0023_remove_attendance_models'),
    ]

    operations = []
