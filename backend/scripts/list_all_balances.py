#!/usr/bin/env python
"""List all staff balances to help user identify the correct staff"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from django.contrib.auth import get_user_model
from staff_requests.models import StaffLeaveBalance
from collections import defaultdict

User = get_user_model()

print("=" * 80)
print("ALL STAFF WITH BALANCES")
print("=" * 80)

# Get all staff who have balances
staff_with_balances = defaultdict(dict)

for balance in StaffLeaveBalance.objects.all():
    staff_id = balance.staff.id
    staff_with_balances[staff_id]['username'] = balance.staff.username
    staff_with_balances[staff_id]['name'] = balance.staff.get_full_name()
    staff_with_balances[staff_id][balance.leave_type] = balance.balance

# Sort by staff ID
for staff_id in sorted(staff_with_balances.keys()):
    data = staff_with_balances[staff_id]
    print(f"\nStaff ID: {staff_id}")
    print(f"Username: {data['username']}")
    print(f"Name: {data.get('name', 'N/A')}")
    print("Balances:")
    
    for key, val in data.items():
        if key not in ['username', 'name']:
            print(f"  {key}: {val}")
