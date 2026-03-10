#!/usr/bin/env python
"""Verify that COL earning works correctly"""
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
print("VERIFYING COL EARN FUNCTIONALITY")
print("=" * 80)

# Find staff with recent COL earn requests
staff = User.objects.filter(username__icontains='Swethabharathi').first()

if not staff:
    print("Staff not found!")
    sys.exit(1)

print(f"\nStaff: {staff.username} (ID: {staff.id})")

# Get current COL balance
col_balance = StaffLeaveBalance.objects.filter(
    staff=staff,
    leave_type__icontains='Compensatory'
).first()

print(f"\nCurrent COL balance: {col_balance.balance if col_balance else 0}")

# Get recent COL earn requests
col_requests = StaffRequest.objects.filter(
    applicant=staff,
    template__name__icontains='Compensatory',
    template__leave_policy__action='earn',
    status='approved'
).order_by('-updated_at')[:5]

print(f"\nRecent COL earn requests: {col_requests.count()}")
for req in col_requests:
    date = req.form_data.get('date') or req.form_data.get('from_date')
    print(f"  Request {req.id}: Date {date}, Updated: {req.updated_at}")

print("\n" + "=" * 80)
print("To test:")
print("1. Restart Django backend server")
print("2. Login as Swethabharathi R")
print("3. Apply for Compensatory leave on a holiday (e.g., March 15)")
print("4. Get it approved")
print("5. Check calendar - should see 'Worked (COL)' badge on March 15")
print("6. Check balances - COL should increase from 0 to 1")
print("=" * 80)
