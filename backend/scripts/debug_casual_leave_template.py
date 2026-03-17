"""
Debug script to check Casual Leave template configuration
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
    # Find Casual Leave template
    templates = RequestTemplate.objects.filter(name__icontains='casual')
    
    if not templates.exists():
        print("❌ No Casual Leave template found")
        return
    
    for template in templates:
        print(f"\n{'='*80}")
        print(f"Template: {template.name}")
        print(f"ID: {template.id}")
        print(f"Active: {template.is_active}")
        print(f"{'='*80}\n")
        
        # Check form schema
        print("📋 Form Schema Fields:")
        print("-" * 80)
        for field in template.form_schema:
            field_type = field.get('type', 'unknown')
            field_name = field.get('name', 'unknown')
            field_label = field.get('label', '')
            field_required = field.get('required', False)
            print(f"  • {field_name:20} | Type: {field_type:10} | Label: {field_label:25} | Required: {field_required}")
        
        # Check leave policy
        print(f"\n📊 Leave Policy:")
        print("-" * 80)
        if template.leave_policy:
            for key, value in template.leave_policy.items():
                print(f"  • {key}: {value}")
        else:
            print("  ⚠️  No leave policy configured")
        
        # Check attendance action
        print(f"\n⏰ Attendance Action:")
        print("-" * 80)
        if template.attendance_action:
            for key, value in template.attendance_action.items():
                if key == 'apply_to_dates' and isinstance(value, list):
                    print(f"  • {key}: {', '.join(value)}")
                else:
                    print(f"  • {key}: {value}")
        else:
            print("  ℹ️  No attendance action configured")

if __name__ == '__main__':
    main()
