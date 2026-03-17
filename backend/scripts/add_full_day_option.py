"""
Add 'Full day' option to from_noon and to_noon fields in Casual Leave, ON duty, and COL templates
"""
import django
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

django.setup()

from staff_requests.models import RequestTemplate

def main():
    # Find templates to update: Casual Leave, ON duty, and COL
    template_names = ['Casual Leave', 'ON duty', 'Compensatory']
    
    updated_templates = []
    
    for template_name in template_names:
        templates = RequestTemplate.objects.filter(name__icontains=template_name.split()[0])
        
        for template in templates:
            updated = False
            print(f"\n{'='*80}")
            print(f"Processing Template: {template.name}")
            print(f"{'='*80}")
            
            # Update form schema
            for field in template.form_schema:
                field_name = field.get('name', '')
                
                # Check if this is a noon field (from_noon or to_noon)
                if field_name in ['from_noon', 'to_noon']:
                    current_options = field.get('options', [])
                    print(f"\nField: {field_name}")
                    print(f"  Current options: {current_options}")
                    
                    # Add 'Full day' if not already present
                    if 'Full day' not in current_options:
                        # Insert 'Full day' at the beginning
                        new_options = ['Full day'] + current_options
                        field['options'] = new_options
                        updated = True
                        print(f"  ✓ Added 'Full day' option")
                        print(f"  New options: {new_options}")
                    else:
                        print(f"  → 'Full day' already present")
            
            if updated:
                template.save()
                updated_templates.append(template.name)
                print(f"\n✓ Updated template: {template.name}")
            else:
                print(f"\n→ No changes needed for: {template.name}")
    
    print(f"\n{'='*80}")
    print(f"Summary: Updated {len(updated_templates)} template(s)")
    if updated_templates:
        for name in updated_templates:
            print(f"  • {name}")
    print(f"{'='*80}")

if __name__ == '__main__':
    main()
