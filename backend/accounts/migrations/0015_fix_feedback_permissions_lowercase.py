from django.db import migrations


def fix_feedback_permissions_to_lowercase(apps, schema_editor):
    """Convert UPPERCASE feedback permissions to lowercase to match project conventions."""
    Permission = apps.get_model('accounts', 'Permission')
    
    # Map old uppercase codes to new lowercase codes
    permission_mapping = {
        'FEEDBACK.FEEDBACK_PAGE': 'feedback.feedback_page',
        'FEEDBACK.CREATE': 'feedback.create',
        'FEEDBACK.REPLY': 'feedback.reply',
    }
    
    for old_code, new_code in permission_mapping.items():
        try:
            perm = Permission.objects.get(code=old_code)
            perm.code = new_code
            perm.save()
        except Permission.DoesNotExist:
            # Permission doesn't exist with old code, might already be lowercase
            pass


def revert_feedback_permissions_to_uppercase(apps, schema_editor):
    """Revert lowercase feedback permissions back to uppercase."""
    Permission = apps.get_model('accounts', 'Permission')
    
    # Map new lowercase codes back to old uppercase codes
    permission_mapping = {
        'feedback.feedback_page': 'FEEDBACK.FEEDBACK_PAGE',
        'feedback.create': 'FEEDBACK.CREATE',
        'feedback.reply': 'FEEDBACK.REPLY',
    }
    
    for new_code, old_code in permission_mapping.items():
        try:
            perm = Permission.objects.get(code=new_code)
            perm.code = old_code
            perm.save()
        except Permission.DoesNotExist:
            pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0014_add_feedback_permissions'),
    ]

    operations = [
        migrations.RunPython(
            fix_feedback_permissions_to_lowercase,
            revert_feedback_permissions_to_uppercase
        ),
    ]
