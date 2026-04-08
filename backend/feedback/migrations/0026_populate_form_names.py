# Generated migration to populate form_name for existing forms

from django.db import migrations

def populate_form_names(apps, schema_editor):
    """Populate form_name for existing feedback forms that have empty values"""
    FeedbackForm = apps.get_model('feedback', 'FeedbackForm')
    
    for form in FeedbackForm.objects.all():
        # If form_name is empty, generate a default based on type
        if not form.form_name or not form.form_name.strip():
            form_type = "Subject Feedback" if form.type == 'SUBJECT_FEEDBACK' else "Common Feedback"
            form.form_name = f"{form_type} (ID: {form.id})"
            form.save()

def reverse_populate_form_names(apps, schema_editor):
    """Reverse: clear form_name values (optional)"""
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0025_merge_20260407_1037'),
    ]

    operations = [
        migrations.RunPython(populate_form_names, reverse_populate_form_names),
    ]
