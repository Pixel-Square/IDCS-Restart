#!/usr/bin/env python
"""Check and fix staff 3171023 balances"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from django.contrib.auth import get_user_model
from staff_requests.models import StaffRequest, StaffLeaveBalance
from datetime import datetime

User = get_user_model()

print("=" * 80)
print("CHECKING STAFF 3171023")
print("=" * 80)

# Find staff
staff = User.objects.filter(id=3171023).first()
if not staff:
    staff = User.objects.filter(username='3171023').first()

if not staff:
    print("\nStaff 3171023 not found!")
    print("\nSample users in database:")
    for u in User.objects.all()[:10]:
        print(f"  ID: {u.id}, Username: {u.username}")
    sys.exit(1)

print(f"\nFound: {staff.username} (ID: {staff.id})")
print(f"Name: {staff.get_full_name()}")

# Get balances
print("\nCurrent Balances:")
balances = StaffLeaveBalance.objects.filter(staff=staff)
for b in balances:
    print(f"  {b.leave_type}: {b.balance}")

# Get recent requests with dates
print("\nRecent Approved Requests:")
requests = StaffRequest.objects.filter(
    applicant=staff,
    status='approved'
).order_by('-updated_at')[:10]

for r in requests:
    claim_col = r.form_data.get('claim_col', False) if r.form_data else False
    from_date = r.form_data.get('from_date') or r.form_data.get('date') if r.form_data else None
    
    print(f"\n  Request ID: {r.id}")
    print(f"  Template: {r.template.name}")
    print(f"  Date: {from_date}")
    print(f"  Claim COL: {claim_col}")

# Now fix the balances
print("\n" + "=" * 80)
print("FIXING BALANCES")
print("=" * 80)

# According to user: Leave should be 2, COL should be 0
leave_balance = StaffLeaveBalance.objects.filter(
    staff=staff,
    leave_type__icontains='Leave'
).exclude(
    leave_type__icontains='Compensatory'
).first()

col_balance = StaffLeaveBalance.objects.filter(
    staff=staff,
    leave_type__icontains='Compensatory'
).first()

if leave_balance:
    old_val = leave_balance.balance
    leave_balance.balance = 2.0
    leave_balance.save()
    print(f"\n✓ Updated {leave_balance.leave_type}: {old_val} → 2.0")

if col_balance:
    old_val = col_balance.balance
    col_balance.balance = 0.0
    col_balance.save()
    print(f"✓ Updated {col_balance.leave_type}: {old_val} → 0.0")

print("\nBalances corrected!")
