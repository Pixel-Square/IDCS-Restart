#!/usr/bin/env python
"""Find staff matching Leave=1, COL=1 pattern"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import StaffLeaveBalance, StaffRequest
from collections import defaultdict

print("=" * 80)
print("STAFF WITH LEAVE≈1 AND COL≈1 PATTERN")
print("=" * 80)

# Build balance map
balance_map = defaultdict(dict)
for b in StaffLeaveBalance.objects.select_related('staff').all():
    balance_map[b.staff.id]['username'] = b.staff.username
    balance_map[b.staff.id]['name'] = b.staff.get_full_name()
    balance_map[b.staff.id][b.leave_type] = b.balance

# Find matching pattern
matches = []
for staff_id, data in balance_map.items():
    has_leave_1 = any(
        'Leave' in k and 'Compensatory' not in k and abs(v - 1.0) < 0.01
        for k, v in data.items()
        if k not in ['username', 'name']
    )
    has_col_1 = any(
        'Compensatory' in k and abs(v - 1.0) < 0.01
        for k, v in data.items()
        if k not in ['username', 'name']
    )
    
    if has_leave_1 and has_col_1:
        matches.append((staff_id, data))

if matches:
    print(f"\nFound {len(matches)} staff matching pattern:\n")
    for staff_id, data in matches:
        print(f"Staff ID: {staff_id}")
        print(f"Username: {data['username']}")
        print(f"Name: {data.get('name', 'N/A')}")
        print("Balances:")
        for k, v in data.items():
            if k not in ['username', 'name']:
                print(f"  {k}: {v}")
        
        # Check recent requests
        requests = StaffRequest.objects.filter(
            applicant_id=staff_id,
            status='approved'
        ).order_by('-updated_at')[:3]
        
        if requests:
            print("\nRecent requests:")
            for r in requests:
                claim_col = r.form_data.get('claim_col') if r.form_data else False
                print(f"  ID {r.id}: {r.template.name} [claim_col={claim_col}]")
        
        print("\n" + "-" * 80 + "\n")
else:
    print("\nNo staff found matching Leave=1, COL=1 pattern")
    print("\n Showing staff with any COL balance:")
    for staff_id, data in balance_map.items():
        has_col = any('Compensatory' in k for k in data.keys() if k not in ['username', 'name'])
        if has_col:
            print(f"\nStaff ID: {staff_id} - {data['username']}")
            for k, v in data.items():
                if k not in ['username', 'name']:
                    print(f"  {k}: {v}")
