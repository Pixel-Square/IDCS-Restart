#!/usr/bin/env python
"""Find staff with Leave=1, COL=1 pattern that might need fixing"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from django.contrib.auth import get_user_model
from staff_requests.models import StaffRequest, StaffLeaveBalance

User = get_user_model()

print("=" * 80)
print("FINDING STAFF WITH LEAVE=1, COL=1 PATTERN")
print("=" * 80)

# Find all staff with COL balance = 1
col_balances = StaffLeaveBalance.objects.filter(
    leave_type__icontains='Compensatory',
    balance=1.0
)

print(f"\nFound {col_balances.count()} staff with COL=1\n")

for col_bal in col_balances:
    staff = col_bal.staff
    
    # Check if they also have Leave=1
    leave_bal = StaffLeaveBalance.objects.filter(
        staff=staff,
        leave_type__icontains='Leave'
    ).exclude(
        leave_type__icontains='Compensatory'
    ).first()
    
    if leave_bal and leave_bal.balance == 1.0:
        print(f"Staff ID: {staff.id}")
        print(f"Username: {staff.username}")
        print(f"Name: {staff.get_full_name()}")
        print(f"Balances:")
        
        all_balances = StaffLeaveBalance.objects.filter(staff=staff)
        for b in all_balances:
            print(f"  {b.leave_type}: {b.balance}")
        
        # Check for recent claim_col requests
        claim_requests = StaffRequest.objects.filter(
            applicant=staff,
            status='approved'
        ).order_by('-updated_at')[:5]
        
        print(f"\nRecent requests:")
        for r in claim_requests:
            claim_col = r.form_data.get('claim_col', False) if r.form_data else False
            if claim_col:
                print(f"  ✓ Request {r.id}: {r.template.name} [CLAIM_COL]")
                from_date = r.form_data.get('from_date') or r.form_data.get('date')
                print(f"    Date: {from_date}")
            else:
                print(f"  Request {r.id}: {r.template.name}")
        
        print("\n" + "-" * 80 + "\n")

# Also search by ID pattern if they used it as username
print("\nSearching for usernames containing '3171023':")
users = User.objects.filter(username__icontains='3171023')
for u in users:
    print(f"  ID: {u.id}, Username: {u.username}")

print("\nSearching for usernames containing '317102':")
users = User.objects.filter(username__icontains='317102')
for u in users:
    print(f"  ID: {u.id}, Username: {u.username}")
