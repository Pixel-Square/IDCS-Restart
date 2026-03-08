#!/usr/bin/env python
"""
Fix Leave balances for staff who had claim_col requests approved.
When claim_col is checked and COL covers all days, leave balance should not be reduced.
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import StaffRequest, StaffLeaveBalance
from datetime import datetime

print("=" * 80)
print("FIXING LEAVE BALANCES FOR claim_col REQUESTS")
print("=" * 80)

# Find all approved requests with claim_col
requests_with_claim = []
for r in StaffRequest.objects.filter(status='approved').order_by('-updated_at')[:50]:
    if r.form_data and r.form_data.get('claim_col'):
        requests_with_claim.append(r)

print(f"\nFound {len(requests_with_claim)} approved requests with claim_col\n")

for req in requests_with_claim:
    print(f"Request ID: {req.id}")
    print(f"  Applicant: {req.applicant.username} (ID: {req.applicant.id})")
    print(f"  Template: {req.template.name}")
    print(f"  Date range: {req.form_data.get('from_date')} to {req.form_data.get('to_date')}")
    
    # Calculate days
    from_date = req.form_data.get('from_date') or req.form_data.get('start_date') or req.form_data.get('date')
    to_date = req.form_data.get('to_date') or req.form_data.get('end_date') or req.form_data.get('date')
    
    if from_date and to_date:
        if isinstance(from_date, str):
            from_dt = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
        else:
            from_dt = from_date
        
        if isinstance(to_date, str):
            to_dt = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
        else:
            to_dt = to_date
        
        days = (to_dt.date() - from_dt.date()).days + 1
    else:
        days = req.form_data.get('days', 1)
    
    print(f"  Days requested: {days}")
    
    # Check current balances
    leave_balance = StaffLeaveBalance.objects.filter(
        staff=req.applicant,
        leave_type=req.template.name
    ).first()
    
    col_balance = StaffLeaveBalance.objects.filter(
        staff=req.applicant,
        leave_type__icontains='Compensatory'
    ).first()
    
    print(f"  Current {req.template.name} balance: {leave_balance.balance if leave_balance else 'N/A'}")
    print(f"  Current COL balance: {col_balance.balance if col_balance else 'N/A'}")
    
    # The fix: If claim_col was used and should have covered all days, restore the leave balance
    # We need to add back the days that were incorrectly deducted
    if leave_balance:
        print(f"\n  ACTION: Adding {days} days back to {req.template.name} balance")
        leave_balance.balance += days
        leave_balance.save()
        print(f"  NEW {req.template.name} balance: {leave_balance.balance}")
    
    print("\n" + "-" * 80 + "\n")

print("\nBalance restoration complete!")
