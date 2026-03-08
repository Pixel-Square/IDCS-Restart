#!/usr/bin/env python
"""Check and fix Swethabharathi R (ID 8663) balances"""
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
print("CHECKING SWETHABHARATHI R (ID 8663)")
print("=" * 80)

# Find by username
staff = User.objects.filter(username__icontains='Swethabharathi').first()

if not staff:
    print("Staff not found!")
    sys.exit(1)

print(f"\nStaff ID: {staff.id}")
print(f"Username: {staff.username}")
print(f"Email: {staff.email}")

# Get ALL current balances
print("\n" + "=" * 80)
print("CURRENT BALANCES")
print("=" * 80)
balances = StaffLeaveBalance.objects.filter(staff=staff)
for b in balances:
    print(f"{b.leave_type}: {b.balance}")

# Get recent requests
print("\n" + "=" * 80)
print("RECENT APPROVED REQUESTS")
print("=" * 80)
requests = StaffRequest.objects.filter(
    applicant=staff,
    status='approved'
).order_by('-updated_at')[:10]

for r in requests:
    claim_col = r.form_data.get('claim_col', False) if r.form_data else False
    from_date = r.form_data.get('from_date') or r.form_data.get('date') if r.form_data else None
    to_date = r.form_data.get('to_date') or r.form_data.get('date') if r.form_data else None
    
    print(f"\nRequest ID: {r.id}")
    print(f"  Template: {r.template.name}")
    print(f"  Action: {r.template.leave_policy.get('action') if r.template.leave_policy else 'N/A'}")
    print(f"  From: {from_date}, To: {to_date}")
    print(f"  Claim COL: {claim_col}")
    print(f"  Updated: {r.updated_at}")

# Check for any pending requests
pending = StaffRequest.objects.filter(
    applicant=staff,
    status__in=['pending', 'under_review']
).count()
print(f"\n\nPending requests: {pending}")

print("\n" + "=" * 80)
print("FIXING BALANCES")
print("=" * 80)

# Set Leave to 2, COL to 0 as user specified
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

print(f"\nTarget: Leave=2.0, COL=0.0")

if leave_balance:
    old_val = leave_balance.balance
    leave_balance.balance = 2.0
    leave_balance.save()
    print(f"✓ {leave_balance.leave_type}: {old_val} → 2.0")
else:
    print("⚠ No leave balance found - creating with value 2.0")
    # Find Leave template
    from staff_requests.models import RequestTemplate
    leave_template = RequestTemplate.objects.filter(
        name__icontains='Leave',
        is_active=True
    ).exclude(name__icontains='Compensatory').first()
    
    if leave_template:
        leave_balance = StaffLeaveBalance.objects.create(
            staff=staff,
            leave_type=leave_template.name,
            balance=2.0
        )
        print(f"✓ Created {leave_template.name}: 2.0")

if col_balance:
    old_val = col_balance.balance
    col_balance.balance = 0.0
    col_balance.save()
    print(f"✓ {col_balance.leave_type}: {old_val} → 0.0")
else:
    print("ℹ No COL balance entry (this is fine, means COL=0)")

print("\n" + "=" * 80)
print("FINAL BALANCES")
print("=" * 80)
balances = StaffLeaveBalance.objects.filter(staff=staff)
for b in balances:
    print(f"{b.leave_type}: {b.balance}")

print("\n✓ Balances corrected!")
