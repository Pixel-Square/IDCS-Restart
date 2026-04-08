# Generated manually on 2026-04-06

import secrets
from django.db import migrations, models


def _generate_6digit_id():
    """Generate a random 6-digit numeric ID."""
    return ''.join(secrets.choice('0123456789') for _ in range(6))


def populate_internal_ids(apps, schema_editor):
    """Generate unique internal_id for all existing StaffProfile rows."""
    StaffProfile = apps.get_model('academics', 'StaffProfile')
    existing_ids = set()
    for profile in StaffProfile.objects.all():
        uid = _generate_6digit_id()
        while uid in existing_ids:
            uid = _generate_6digit_id()
        existing_ids.add(uid)
        profile.internal_id = uid
        profile.save(update_fields=['internal_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0084_staff_id_6digit_numeric'),
    ]

    operations = [
        # 1. Add internal_id as nullable first (no index yet to avoid deferred creation)
        migrations.AddField(
            model_name='staffprofile',
            name='internal_id',
            field=models.CharField(
                max_length=6,
                null=True,
                blank=True,
                editable=False,
                help_text='Auto-generated 6-digit numeric unique ID.',
            ),
        ),
        # 2. Populate existing rows with unique random IDs
        migrations.RunPython(populate_internal_ids, reverse_code=migrations.RunPython.noop),
        # 3. Make internal_id non-nullable, unique, and indexed
        migrations.AlterField(
            model_name='staffprofile',
            name='internal_id',
            field=models.CharField(
                max_length=6,
                unique=True,
                db_index=True,
                editable=False,
                help_text='Auto-generated 6-digit numeric unique ID.',
            ),
        ),
        # 4. Rename ext_uid to external_id in ExtStaffProfile
        migrations.RenameField(
            model_name='extstaffprofile',
            old_name='ext_uid',
            new_name='external_id',
        ),
    ]
