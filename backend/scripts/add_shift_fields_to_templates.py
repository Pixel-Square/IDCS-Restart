"""
Add shift fields (from_shift and to_shift) to all request templates
that have date range fields (from_date/to_date or start_date/end_date).

This allows staff to specify FN (Forenoon) or AN (Afternoon) sessions
for date ranges. Example: "11th March AN to 12th March FN"
"""
import os, sys, django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import RequestTemplate

def add_shift_fields():
    """Add from_shift and to_shift fields to templates with date ranges"""
    
    shift_options = [
        {'value': 'FN', 'label': 'Forenoon (FN)'},
        {'value': 'AN', 'label': 'Afternoon (AN)'},
        {'value': 'FULL', 'label': 'Full Day'}
    ]
    
    from_shift_field = {
        'name': 'from_shift',
        'type': 'select',
        'label': 'From Shift (Optional)',
        'required': False,
        'options': shift_options,
        'help_text': 'Select FN or AN if applying for half day on from date'
    }
    
    to_shift_field = {
        'name': 'to_shift',
        'type': 'select',
        'label': 'To Shift (Optional)',
        'required': False,
        'options': shift_options,
        'help_text': 'Select FN or AN if applying for half day on to date'
    }
    
    templates = RequestTemplate.objects.filter(is_active=True)
    updated_count = 0
    
    for template in templates:
        form_schema = template.form_schema
        
        # Check if template has date range fields
        has_from_date = any(
            field.get('name') in ['from_date', 'start_date', 'fromDate', 'startDate']
            for field in form_schema
        )
        has_to_date = any(
            field.get('name') in ['to_date', 'end_date', 'toDate', 'endDate']
            for field in form_schema
        )
        
        if not (has_from_date and has_to_date):
            print(f'⊘ Skipping {template.name}: No date range fields')
            continue
        
        # Check if shift fields already exist
        has_from_shift = any(field.get('name') == 'from_shift' for field in form_schema)
        has_to_shift = any(field.get('name') == 'to_shift' for field in form_schema)
        
        if has_from_shift and has_to_shift:
            print(f'✓ {template.name}: Already has shift fields')
            continue
        
        # Find positions to insert shift fields (right after date fields)
        from_date_idx = None
        to_date_idx = None
        
        for idx, field in enumerate(form_schema):
            if field.get('name') in ['from_date', 'start_date', 'fromDate', 'startDate']:
                from_date_idx = idx
            if field.get('name') in ['to_date', 'end_date', 'toDate', 'endDate']:
                to_date_idx = idx
        
        # Add shift fields
        if from_date_idx is not None and not has_from_shift:
            form_schema.insert(from_date_idx + 1, from_shift_field)
            print(f'  + Added from_shift after position {from_date_idx}')
        
        # Update to_date_idx if we inserted from_shift before it
        if from_date_idx is not None and to_date_idx is not None and from_date_idx < to_date_idx:
            to_date_idx += 1
        
        if to_date_idx is not None and not has_to_shift:
            form_schema.insert(to_date_idx + 1, to_shift_field)
            print(f'  + Added to_shift after position {to_date_idx}')
        
        # Update template
        template.form_schema = form_schema
        
        # Make from_date and to_date optional (not required)
        for field in template.form_schema:
            if field.get('name') in ['from_date', 'to_date', 'start_date', 'end_date']:
                field['required'] = False
                print(f'  ✎ Made {field["name"]} optional')
        
        template.save()
        updated_count += 1
        print(f'✓ Updated {template.name}')
    
    print(f'\n✓ Updated {updated_count} template(s)')
    print('\nNow staff can apply leave like:')
    print('  • 11th March AN to 12th March FN')
    print('  • Full day leave (leave shifts empty)')
    print('  • Half day leave (select one shift)')

if __name__ == '__main__':
    add_shift_fields()
