"""
Fix trailing space in FN option for all templates
"""
import django
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

django.setup()

from staff_requests.models import RequestTemplate

def main():
    templates = RequestTemplate.objects.filter(is_active=True).exclude(name='Late Entry Permission')
    updated_count = 0
    
    for template in templates:
        modified = False
        
        for field in template.form_schema:
            if field.get('name') in ['from_noon', 'to_noon'] and field.get('type') == 'select':
                if field.get('options'):
                    # Fix trailing spaces in options
                    old_options = field['options']
                    new_options = [opt.strip() for opt in old_options]
                    
                    if old_options != new_options:
                        field['options'] = new_options
                        modified = True
                        print(f"  ✓ Fixed {field['name']} options: {old_options} → {new_options}")
        
        if modified:
            template.save()
            print(f"✓ Updated template: {template.name}")
            updated_count += 1
    
    print(f"\n✅ Fixed {updated_count} template(s)")

if __name__ == '__main__':
    main()
