import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from accounts.models import User
from staff_requests.models import RequestTemplate, StaffLeaveBalance, StaffRequest
from datetime import date

# Find HR user
hr_user = User.objects.filter(roles__name='HR').first()

if not hr_user:
    print("No HR user found")
    sys.exit(1)

print(f"=== HR User: {hr_user.username} ===\n")
print(f"Staff ID: {hr_user.staff_profile.staff_id if hasattr(hr_user, 'staff_profile') else 'N/A'}")
print(f"Roles: {', '.join(hr_user.roles.values_list('name', flat=True))}")
print()

# Check templates
print("=== Active Templates ===\n")
templates = RequestTemplate.objects.filter(is_active=True)
for template in templates:
    policy = template.leave_policy or {}
    action = policy.get('action', 'none')
    allotment = policy.get('allotment_per_role', {})
    print(f"Template: {template.name}")
    print(f"  Action: {action}")
    print(f"  Allotment: {allotment}")
    print()

# Check balance records
print("\n=== StaffLeaveBalance Records ===\n")
balances = StaffLeaveBalance.objects.filter(staff=hr_user)
print(f"Total balance records: {balances.count()}\n")
for balance in balances:
    print(f"  {balance.leave_type}: {balance.balance}")

# Check approved requests this month
print("\n=== Approved Requests (March 2026) ===\n")
current_year = 2026
current_month = 3

requests = StaffRequest.objects.filter(
    applicant=hr_user,
    status='approved',
    created_at__year=current_year,
    created_at__month=current_month
)
print(f"Total approved requests: {requests.count()}\n")
for req in requests:
    print(f"  Template: {req.template.name}")
    print(f"  Status: {req.status}")
    print(f"  Form data: {req.form_data}")
    print()

print("\n=== Simulate Balances Calculation ===\n")
# Simulate what the balances endpoint should return
for template in templates:
    policy = template.leave_policy or {}
    if not policy or 'action' not in policy:
        continue
    
    action = policy.get('action')
    leave_type = template.name
    allotment_per_role = policy.get('allotment_per_role', {})
    
    # Get user's primary role
    roles = hr_user.roles.values_list('name', flat=True)
    role_priority = ['HOD', 'FACULTY', 'STAFF', 'HR']
    user_role = 'STAFF'
    for role in role_priority:
        if role in roles:
            user_role = role
            break
    
    allotment = allotment_per_role.get(user_role, 0)
    
    # Get approved requests
    approved = StaffRequest.objects.filter(
        applicant=hr_user,
        template=template,
        status='approved',
        created_at__year=current_year,
        created_at__month=current_month
    )
    
    total_days = 0
    for req in approved:
        # Simple calculation - would need actual logic
        form_data = req.form_data
        # Check for date range fields
        if 'start_date' in form_data and 'end_date' in form_data:
            from datetime import datetime
            try:
                start = datetime.strptime(form_data['start_date'], '%Y-%m-%d').date()
                end = datetime.strptime(form_data['end_date'], '%Y-%m-%d').date()
                total_days += (end - start).days + 1
            except:
                pass
    
    if action == 'deduct':
        balance = allotment - total_days
        print(f"{leave_type} (deduct):")
        print(f"  Role: {user_role}")
        print(f"  Allotment: {allotment}")
        print(f"  Used: {total_days}")
        print(f"  Balance: {balance}")
        print()
    elif action == 'earn':
        balance = total_days
        print(f"{leave_type} (earn):")
        print(f"  Earned: {total_days}")
        print()
    elif action == 'neutral':
        balance = total_days
        print(f"{leave_type} (neutral):")
        print(f"  Count: {total_days}")
        print()
