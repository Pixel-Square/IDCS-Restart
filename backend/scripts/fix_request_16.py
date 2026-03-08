#!/usr/bin/env python
"""Fix the existing approved COL request that didn't update balance"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import StaffRequest, StaffLeaveBalance

print("=" * 80)
print("FIXING REQUEST 16 - COL EARN BALANCE")
print("=" * 80)

# Get Request 16
req = StaffRequest.objects.filter(id=16).first()

if not req:
    print("Request 16 not found")
    sys.exit(1)

print(f"\nRequest ID: {req.id}")
print(f"Applicant: {req.applicant.username}")
print(f"Template: {req.template.name}")
print(f"Status: {req.status}")
print(f"Date: {req.form_data.get('date')}")

# Get current COL balance
col_balance = StaffLeaveBalance.objects.filter(
    staff=req.applicant,
    leave_type__icontains='Compensatory'
).first()

print(f"\nCurrent COL balance: {col_balance.balance if col_balance else 0}")

# Calculate days from request
from datetime import datetime
days = 1  # Default

# Manually add the earned day
if col_balance:
    old_balance = col_balance.balance
    col_balance.balance += days
    col_balance.save()
    print(f"\n✓ Updated COL balance: {old_balance} → {col_balance.balance}")
else:
    # Create the balance entry
    col_balance = StaffLeaveBalance.objects.create(
        staff=req.applicant,
        leave_type=req.template.name,
        balance=days
    )
    print(f"\n✓ Created COL balance with {days} day(s)")

print("\n" + "=" * 80)
print("Balance fixed! COL should now show 1 in the UI after reload.")
print("=" * 80)
