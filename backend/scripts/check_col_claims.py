#!/usr/bin/env python
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import StaffRequest, StaffLeaveBalance
from django.contrib.auth import get_user_model
import json

User = get_user_model()

print("=" * 80)
print("APPROVED REQUESTS WITH claim_col=True")
print("=" * 80)

requests = StaffRequest.objects.filter(status='approved').order_by('-updated_at')[:20]

col_requests = []
for r in requests:
    if r.form_data and r.form_data.get('claim_col'):
        col_requests.append(r)
        print(f"\nRequest ID: {r.id}")
        print(f"  Applicant: {r.applicant.username} (ID: {r.applicant.id})")
        print(f"  Template: {r.template.name}")
        print(f"  Form Data: {json.dumps(r.form_data, indent=4)}")
        print(f"  Created: {r.created_at}")
        print(f"  Updated: {r.updated_at}")
        
        balances = StaffLeaveBalance.objects.filter(staff=r.applicant)
        print(f"  Current Balances:")
        for bal in balances:
            print(f"    - {bal.leave_type}: {bal.balance}")

print(f"\n\nTotal requests with claim_col: {len(col_requests)}")

# Check for username 3171022
print("\n" + "=" * 80)
print("CHECKING FOR STAFF 3171022")
print("=" * 80)

staff_by_username = User.objects.filter(username__contains='3171022')
print(f"Found {staff_by_username.count()} users with username containing '3171022':")
for u in staff_by_username:
    print(f"  - ID: {u.id}, Username: {u.username}, Name: {u.get_full_name()}")
    
staff_by_id = User.objects.filter(id=3171022).first()
if staff_by_id:
    print(f"\nUser with ID 3171022: {staff_by_id.username}")
else:
    print(f"\nNo user with ID 3171022")
