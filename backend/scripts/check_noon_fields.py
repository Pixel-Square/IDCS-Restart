"""
Check if from_noon and to_noon fields have options configured
"""
import django
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

django.setup()

from staff_requests.models import RequestTemplate

# Find Casual Leave template
template = RequestTemplate.objects.filter(name__icontains='casual').first()

if not template:
    print("❌ No Casual Leave template found")
    exit(1)

print(f"Template: {template.name}\n")

for field in template.form_schema:
    if 'noon' in field.get('name', '').lower():
        print(f"Field: {field.get('name')}")
        print(f"  Type: {field.get('type')}")
        print(f"  Label: {field.get('label')}")
        print(f"  Required: {field.get('required')}")
        print(f"  Options: {field.get('options', 'NOT SET')}")
        print(f"  Full field: {json.dumps(field, indent=2)}")
        print()
