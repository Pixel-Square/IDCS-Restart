from django.db import migrations


class Migration(migrations.Migration):
    # Merge migration for divergent 0003 heads
    dependencies = [
        ("accounts", "0003_add_hod_teaching_permissions"),
        ("accounts", "0003_assign_obe_permissions_to_roles"),
    ]

    operations = []
