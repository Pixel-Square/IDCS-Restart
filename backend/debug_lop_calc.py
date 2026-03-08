#!/usr/bin/env python
"""
Debug LOP calculation for the current user
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from datetime import date
from staff_requests.models import StaffRequest, StaffLeaveBalance, RequestTemplate
from accounts.models import User

print("\n=== Debugging LOP Calculation ===\n")

# Get user - change to your username
username = input("Enter your username (or press Enter for 'Ganga Naidu K'): ").strip() or "Ganga Naidu K"

try:
    user = User.objects.get(username=username)
    print(f"User: {user.username} (ID: {user.id})\n")
except User.DoesNotExist:
    print(f"User '{username}' not found!")
    exit(1)

# Get current month
today = date.today()
current_year = today.year
current_month = today.month
print(f"Current Month: {current_year}-{current_month:02d}\n")

# Show all leave balance records for this user
print("=== Stored Leave Balances (StaffLeaveBalance table) ===")
stored_balances = StaffLeaveBalance.objects.filter(staff=user)
if stored_balances.exists():
    for sb in stored_balances:
        print(f"  {sb.leave_type}: {sb.balance}")
    
    # Check specifically for LOP
    lop_balance = stored_balances.filter(leave_type__iexact='LOP').first()
    if lop_balance:
        print(f"\n⚠️  LOP exists in database: {lop_balance.balance}")
    else:
        print(f"\n✓ No LOP record in database")
else:
    print("  (No stored balances)")

print("\n=== Approved Requests This Month ===")
approved_requests = StaffRequest.objects.filter(
    applicant=user,
    status='approved',
    created_at__year=current_year,
    created_at__month=current_month
).select_related('template')

if approved_requests.exists():
    total_by_template = {}
    for req in approved_requests:
        template_name = req.template.name if req.template else 'Unknown'
        
        # Calculate days
        form_data = req.form_data
        days = 1.0  # Default
        
        # Try to extract days
        if 'days' in form_data:
            try:
                days = float(form_data['days'])
            except:
                pass
        elif 'number_of_days' in form_data:
            try:
                days = float(form_data['number_of_days'])
            except:
                pass
        
        print(f"  Request #{req.id}: {template_name} - {days} day(s)")
        print(f"    Form Data: {form_data}")
        print(f"    Created: {req.created_at}")
        
        total_by_template[template_name] = total_by_template.get(template_name, 0) + days
    
    print("\n=== Total Days by Template ===")
    for tmpl, total in total_by_template.items():
        print(f"  {tmpl}: {total} days")
else:
    print("  (No approved requests this month)")

print("\n=== Template Configurations ===")
templates = RequestTemplate.objects.filter(is_active=True).exclude(leave_policy={})
for tmpl in templates:
    policy = tmpl.leave_policy
    action = policy.get('action', 'N/A')
    allotment = policy.get('allotment_per_role', {})
    overdraft = policy.get('overdraft_name', 'N/A')
    print(f"  {tmpl.name}:")
    print(f"    Action: {action}")
    print(f"    Allotment: {allotment}")
    print(f"    Overdraft: {overdraft}")

print("\n=== Calculated Balance (from balances endpoint logic) ===")
for tmpl in templates:
    policy = tmpl.leave_policy
    if 'action' not in policy:
        continue
    
    action = policy.get('action')
    leave_type = tmpl.name
    overdraft_name = policy.get('overdraft_name', 'LOP')
    
    # Get allotment
    allotment = 0
    if action == 'deduct':
        allotment_per_role = policy.get('allotment_per_role', {})
        # Simple role check - try common roles
        for role in ['HOD', 'AHOD', 'FACULTY', 'STAFF']:
            if role in allotment_per_role:
                allotment = allotment_per_role[role]
                break
    
    # Get approved days for this template
    approved_days = StaffRequest.objects.filter(
        applicant=user,
        template=tmpl,
        status='approved',
        created_at__year=current_year,
        created_at__month=current_month
    ).count()  # Simplified - just count requests
    
    # Calculate balance
    if action == 'deduct':
        balance = allotment - approved_days
        overflow = 0
        if balance < 0:
            overflow = abs(balance)
            balance = 0
        
        print(f"  {leave_type}:")
        print(f"    Allotment: {allotment}")
        print(f"    Used: {approved_days}")
        print(f"    Balance: {balance}")
        if overflow > 0:
            print(f"    Overflow to {overdraft_name}: {overflow}")
    elif action == 'earn':
        print(f"  {leave_type}: {approved_days} earned")
    elif action == 'neutral':
        print(f"  {leave_type}: {approved_days} tracked")

print("\n")
