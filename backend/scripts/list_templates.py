import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import RequestTemplate

print("=== Active Request Templates ===\n")

templates = RequestTemplate.objects.filter(is_active=True)

for template in templates:
    leave_policy = template.leave_policy
    action = leave_policy.get('action', 'none')
    allotment = leave_policy.get('allotment_per_role', {})
    attendance_status = leave_policy.get('attendance_status', 'N/A')
    
    print(f"Name: {template.name}")
    print(f"Action: {action}")
    print(f"Attendance Status: {attendance_status}")
    print(f"Allotment per role: {allotment}")
    print(f"Form fields: {len(template.form_schema)} fields")
    print()
