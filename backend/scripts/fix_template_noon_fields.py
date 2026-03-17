"""
Fix form schemas for all templates (except Late Entry Permission)
Structure:
- from_date (required)
- from_noon (required) - dropdown with FN/AN
- to_date (optional)
- to_noon (optional) - dropdown with FN/AN
"""
import os, sys, django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import RequestTemplate

def fix_template_schemas():
    """Fix all template schemas with correct field structure"""
    
    # Define the shift/noon field options (only FN and AN)
    noon_options = [
        {'value': 'FN', 'label': 'Forenoon (FN)'},
        {'value': 'AN', 'label': 'Afternoon (AN)'}
    ]
    
    templates = RequestTemplate.objects.filter(is_active=True).exclude(name='Late Entry Permission')
    updated_count = 0
    
    for template in templates:
        print(f'\n=== Processing {template.name} ===')
        form_schema = template.form_schema
        
        # Track what we have
        has_date_fields = False
        new_schema = []
        
        # First pass: collect non-date fields and check for date fields
        for field in form_schema:
            field_name = field.get('name', '')
            
            # Skip old shift/date fields - we'll recreate them properly
            if field_name in ['from_date', 'from_shift', 'to_date', 'to_shift', 'shift', 'from', 'to', 'date', 'start_date', 'end_date', 'from_noon', 'to_noon']:
                has_date_fields = True
                print(f'  ⊘ Removing old field: {field_name}')
                continue
            
            # Keep non-date fields
            new_schema.append(field)
        
        # If template had date fields, add the new standard fields
        if has_date_fields:
            # Add the standard date/noon fields at the beginning (after reason if exists)
            date_fields = [
                {
                    'name': 'from_date',
                    'type': 'date',
                    'label': 'From Date',
                    'required': True,
                    'help_text': 'Start date of leave/request'
                },
                {
                    'name': 'from_noon',
                    'type': 'select',
                    'label': 'From Noon',
                    'required': True,
                    'options': noon_options,
                    'help_text': 'Select FN (morning) or AN (afternoon) for start date'
                },
                {
                    'name': 'to_date',
                    'type': 'date',
                    'label': 'To Date',
                    'required': False,
                    'help_text': 'End date (optional, leave empty for same day)'
                },
                {
                    'name': 'to_noon',
                    'type': 'select',
                    'label': 'To Noon',
                    'required': False,
                    'options': noon_options,
                    'help_text': 'Select FN or AN for end date (optional)'
                }
            ]
            
            # Insert date fields at position 1 (after reason which is usually at 0)
            if len(new_schema) > 0 and new_schema[0].get('name') == 'reason':
                # Insert after reason
                new_schema = [new_schema[0]] + date_fields + new_schema[1:]
            else:
                # Insert at beginning
                new_schema = date_fields + new_schema
            
            print(f'  ✓ Added standard date/noon fields')
            template.form_schema = new_schema
            template.save()
            updated_count += 1
            
            print(f'  ✓ Updated {template.name}')
            print(f'  Fields: {", ".join([f.get("name") for f in new_schema])}')
        else:
            print(f'  ⊘ No date fields - skipping')
    
    print(f'\n✓ Updated {updated_count} template(s)')
    print('\nNew standard structure:')
    print('  1. from_date (required)')
    print('  2. from_noon (required) - FN/AN dropdown')
    print('  3. to_date (optional)')
    print('  4. to_noon (optional) - FN/AN dropdown')

if __name__ == '__main__':
    fix_template_schemas()
