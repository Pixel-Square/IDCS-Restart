"""
Script to add 'shift' field to Late Entry Permission template.
This allows staff to specify FN (Forenoon) or AN (Afternoon) when requesting late entry permission.

Usage:
    python scripts/add_shift_field_to_late_entry.py

This script will:
1. Find the "Late Entry Permission" template
2. Add a shift dropdown field (FN/AN) to the form schema
3. Update existing templates to support shift-based attendance updates
"""

import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import RequestTemplate


def add_shift_field():
    """Add shift field to Late Entry Permission template"""
    
    # Find Late Entry Permission template
    templates = RequestTemplate.objects.filter(name__icontains='Late Entry')
    
    if not templates.exists():
        print("❌ No 'Late Entry Permission' template found.")
        print("   Please create the template first.")
        return False
    
    template = templates.first()
    print(f"✓ Found template: {template.name}")
    
    # Check if shift field already exists
    form_schema = template.form_schema
    has_shift = any(field.get('name') == 'shift' for field in form_schema)
    
    if has_shift:
        print("ℹ Shift field already exists in this template.")
        return True
    
    # Add shift field after the date field
    shift_field = {
        "name": "shift",
        "label": "Shift",
        "type": "select",
        "required": True,
        "options": ["FN", "AN"],
        "placeholder": "Select shift (FN=Forenoon, AN=Afternoon)"
    }
    
    # Find the date field position and insert shift after it
    date_field_index = None
    for i, field in enumerate(form_schema):
        if field.get('name') == 'date' or field.get('type') == 'date':
            date_field_index = i
            break
    
    if date_field_index is not None:
        form_schema.insert(date_field_index + 1, shift_field)
    else:
        # If no date field found, add at the beginning
        form_schema.insert(0, shift_field)
    
    template.form_schema = form_schema
    template.save()
    
    print(f"✓ Added 'shift' field to {template.name}")
    print("  - Field type: select (dropdown)")
    print("  - Options: FN (Forenoon), AN (Afternoon)")
    print("  - Required: Yes")
    
    return True


def main():
    print("=" * 60)
    print("Add Shift Field to Late Entry Permission Template")
    print("=" * 60)
    print()
    
    success = add_shift_field()
    
    print()
    if success:
        print("✅ Script completed successfully!")
        print()
        print("Next steps:")
        print("1. Staff can now select FN or AN when applying for late entry")
        print("2. On approval, only the selected shift (FN/AN) will be updated")
        print("3. Staff can apply for both FN and AN by submitting two separate requests")
    else:
        print("❌ Script failed. Please check the error messages above.")
    print()
    print("=" * 60)


if __name__ == '__main__':
    main()
