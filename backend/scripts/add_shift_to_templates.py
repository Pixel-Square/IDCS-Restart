"""
Script to add shift field support to leave/OD templates for half-day applications.
This allows staff to apply for FN (Forenoon) or AN (Afternoon) sessions only.

Usage:
    python scripts/add_shift_to_templates.py

This script will:
1. Find leave templates (CL, OD, COL, etc.)
2. Add an optional shift dropdown field (Full Day/FN/AN) to the form schema
3. Enable staff to apply for half-day leaves
"""

import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import RequestTemplate


def add_shift_field_to_template(template, required=False):
    """Add shift field to a template"""
    
    form_schema = template.form_schema
    
    # Check if shift field already exists
    has_shift = any(field.get('name') == 'shift' for field in form_schema)
    
    if has_shift:
        print(f"  ℹ Shift field already exists in '{template.name}'")
        return False
    
    # Add shift field
    shift_field = {
        "name": "shift",
        "label": "Shift / Duration",
        "type": "select",
        "required": required,
        "options": ["Full Day", "FN", "AN"],
        "placeholder": "Select Full Day or specific shift"
    }
    
    # Find the start_date/date field position and insert shift after it
    insert_index = 0
    for i, field in enumerate(form_schema):
        field_name = field.get('name', '')
        if 'date' in field_name.lower() or 'from' in field_name.lower() or 'start' in field_name.lower():
            insert_index = i + 1
            break
    
    form_schema.insert(insert_index, shift_field)
    template.form_schema = form_schema
    template.save()
    
    return True


def main():
    print("=" * 70)
    print("Add Shift Field to Leave/OD Templates (Half-Day Support)")
    print("=" * 70)
    print()
    
    # Templates to update
    template_keywords = [
        'late entry',
        'casual leave',
        'cl',
        'on duty',
        'od',
        'compensatory',
        'col',
        'medical leave',
        'ml'
    ]
    
    updated_count = 0
    
    for keyword in template_keywords:
        templates = RequestTemplate.objects.filter(name__icontains=keyword, is_active=True)
        
        for template in templates:
            print(f"Processing: {template.name}")
            
            # Late Entry should have required shift field
            is_late_entry = 'late entry' in template.name.lower()
            required = is_late_entry
            
            if add_shift_field_to_template(template, required=required):
                print(f"  ✓ Added shift field (required={required})")
                updated_count += 1
            
            print()
    
    print("=" * 70)
    if updated_count > 0:
        print(f"✅ Updated {updated_count} template(s) successfully!")
        print()
        print("Features enabled:")
        print("1. Staff can now select 'FN' (Forenoon) or 'AN' (Afternoon) for half-day leaves")
        print("2. 'Full Day' option is available for full-day leaves")
        print("3. Late Entry Permission requires shift selection (FN or AN)")
        print("4. On approval, only the selected shift will be marked present")
        print()
        print("Examples:")
        print("  - Apply CL for FN only (half-day Casual Leave)")
        print("  - Apply OD for AN only (afternoon On Duty)")
        print("  - Apply Late Entry for FN (forenoon late permission)")
    else:
        print("ℹ No templates were updated (shift field already exists in all templates)")
    
    print()
    print("Note: For existing templates without shift field:")
    print("  - The system will treat them as full-day applications")
    print("  - Both FN and AN will be updated together")
    print("=" * 70)


if __name__ == '__main__':
    main()
