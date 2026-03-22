"""
Script to add a dropdown field before the `reason` field in the
`Others` and `Others - SPL` request templates.

Usage:
    python scripts/add_dropdown_to_others.py

This will update the `form_schema` of matching templates by inserting
a `select` field named `others_category` immediately before the
`reason` field (case-insensitive match).
"""

import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from django.db.models import Q
from staff_requests.models import RequestTemplate


def add_dropdown_before_reason(template):
    form_schema = template.form_schema or []

    # Find index of the reason field (case-insensitive, contains 'reason')
    reason_idx = None
    for i, field in enumerate(form_schema):
        name = (field.get('name') or '').lower()
        if name == 'reason' or 'reason' in name:
            reason_idx = i
            break

    if reason_idx is None:
        print(f"  ⚠ Could not find a 'reason' field in template '{template.name}', skipping")
        return False

    # Avoid duplicate insertion
    if any((f.get('name') or '') == 'others_category' for f in form_schema):
        print(f"  ℹ 'others_category' already present in '{template.name}'")
        return False

    dropdown_field = {
        "name": "others_category",
        "label": "Category",
        "type": "select",
        "required": False,
        "options": ["General", "Personal", "Other"],
        "placeholder": "Select category"
    }

    form_schema.insert(reason_idx, dropdown_field)
    template.form_schema = form_schema
    template.save()

    return True


def main():
    print('=' * 70)
    print("Add dropdown before 'reason' in Others templates")
    print('=' * 70)

    # Target templates (case-insensitive exact match)
    templates = RequestTemplate.objects.filter(
        Q(name__iexact='Others') | Q(name__iexact='Others - SPL'),
        is_active=True,
    )

    if not templates.exists():
        print('No active templates named "Others" or "Others - SPL" were found.')
        return

    updated = 0
    for template in templates:
        print(f"Processing: {template.name}")
        try:
            if add_dropdown_before_reason(template):
                print("  ✓ Inserted dropdown before 'reason'")
                updated += 1
            else:
                print("  ℹ No change made")
        except Exception as e:
            print(f"  ✖ Error updating {template.name}: {e}")

    print('-' * 70)
    print(f'Updated {updated} template(s)')
    print('Done')


if __name__ == '__main__':
    main()
