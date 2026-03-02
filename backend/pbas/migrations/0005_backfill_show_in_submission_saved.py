from django.db import migrations


def backfill_saved_departments(apps, schema_editor):
    PBASCustomDepartment = apps.get_model('pbas', 'PBASCustomDepartment')

    # If a department already has any access staff configured, it has been explicitly saved/configured.
    # Also mark any explicitly created custom departments.
    qs = PBASCustomDepartment.objects.all()
    qs.filter(created_by__isnull=False).update(show_in_submission=True)

    # accesses is a JSON list; mark those that aren't empty.
    try:
        qs.exclude(accesses=[]).update(show_in_submission=True)
    except Exception:
        # If backend doesn't support JSON empty list comparison on the current DB,
        # fall back to leaving it as-is.
        pass


class Migration(migrations.Migration):

    dependencies = [
        ('pbas', '0004_pbascustomdepartment_show_in_submission'),
    ]

    operations = [
        migrations.RunPython(backfill_saved_departments, migrations.RunPython.noop),
    ]
