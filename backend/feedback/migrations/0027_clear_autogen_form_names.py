# Migration to clear auto-generated form_name values

from django.db import migrations

def clear_autogen_form_names(apps, schema_editor):
    """Clear any auto-generated form_name values (Subject Feedback (ID: X))"""
    FeedbackForm = apps.get_model('feedback', 'FeedbackForm')
    
    # Find and clear any form_name that looks auto-generated
    for form in FeedbackForm.objects.all():
        if form.form_name and ('Subject Feedback (ID:' in form.form_name or 'Common Feedback (ID:' in form.form_name):
            form.form_name = ""
            form.save()
            print(f"Cleared form_name for Form ID={form.id}")

def reverse_clear(apps, schema_editor):
    """Reverse: nothing to do"""
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0026_populate_form_names'),
    ]

    operations = [
        migrations.RunPython(clear_autogen_form_names, reverse_clear),
    ]
