import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from accounts.models import User
from staff_requests.models import StaffLeaveBalance

# Find users with HR role
hr_users = User.objects.filter(roles__name='HR').select_related('staff_profile')

print("=== Users with HR role ===\n")
for user in hr_users:
    staff_id = 'N/A'
    if hasattr(user, 'staff_profile') and user.staff_profile:
        staff_id = user.staff_profile.staff_id
    
    print(f"Username: {user.username}")
    print(f"Staff ID: {staff_id}")
    print(f"Roles: {', '.join(user.roles.values_list('name', flat=True))}")
    
    # Check balances
    balances = StaffLeaveBalance.objects.filter(staff=user)
    print(f"\nLeave Balances ({balances.count()}):")
    if balances.exists():
        for balance in balances:
            print(f"  - {balance.leave_type}: {balance.balance}")
    else:
        print("  No balances found")
    
    print("\n" + "="*60 + "\n")
