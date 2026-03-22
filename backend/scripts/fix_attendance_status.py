"""
Update attendance_status in leave_policy to use proper codes
"""
import django
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

django.setup()

from staff_requests.models import RequestTemplate

# Map template names to status codes
STATUS_MAP = {
    'Casual Leave': 'CL',
    'Compensatory leave': 'COL',
    'ON duty': 'OD',
    'Medical Leave': 'ML',
}

templates = RequestTemplate.objects.filter(name__in=STATUS_MAP.keys())

for template in templates:
    if template.leave_policy and 'attendance_status' in template.leave_policy:
        old_status = template.leave_policy['attendance_status']
        new_status = STATUS_MAP.get(template.name)
        
        if new_status and old_status != new_status:
            template.leave_policy['attendance_status'] = new_status
            template.save()
            print(f"✓ {template.name}: {old_status} → {new_status}")
        else:
            print(f"  {template.name}: Already {old_status} (no change)")
    else:
        print(f"⚠️  {template.name}: No attendance_status in leave_policy")

print("\n✅ Done")
