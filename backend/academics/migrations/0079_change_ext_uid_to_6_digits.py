# Generated migration for converting ext_uid from 16-char alphanumeric to 6-digit numeric

from django.db import migrations, models
import secrets


def regenerate_ext_uids(apps, schema_editor):
    """Regenerate all ext_uid values to 6-digit numeric format."""
    ExtStaffProfile = apps.get_model('academics', 'ExtStaffProfile')
    
    existing_uids = set()
    
    for profile in ExtStaffProfile.objects.all():
        # Generate unique 6-digit numeric ID
        while True:
            new_uid = ''.join(secrets.choice('0123456789') for _ in range(6))
            if new_uid not in existing_uids:
                break
        
        existing_uids.add(new_uid)
        profile.ext_uid = new_uid
        profile.save(update_fields=['ext_uid'])


def reverse_migration(apps, schema_editor):
    """No reverse needed - just pass."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0078_ext_staff_form_settings'),
    ]

    operations = [
        # Step 1: Run data migration to regenerate all ext_uid values
        migrations.RunPython(regenerate_ext_uids, reverse_migration),
        
        # Step 2: Alter the field to new max_length
        migrations.AlterField(
            model_name='extstaffprofile',
            name='ext_uid',
            field=models.CharField(db_index=True, editable=False, help_text='Auto-generated 6-digit numeric unique ID.', max_length=6, unique=True),
        ),
    ]
