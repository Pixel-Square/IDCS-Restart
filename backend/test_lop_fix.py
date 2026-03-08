#!/usr/bin/env python
"""
Test the fixed LOP calculation
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from datetime import date
from rest_framework.test import APIRequestFactory
from staff_requests.views import StaffRequestViewSet
from accounts.models import User

print("\n=== Testing Fixed LOP Calculation ===\n")

username = "Ganga Naidu K"
user = User.objects.get(username=username)

print(f"User: {user.username}\n")

# Create a fake request
factory = APIRequestFactory()
request = factory.get('/api/staff-requests/requests/balances/')
request.user = user

# Call the balances endpoint
viewset = StaffRequestViewSet()
viewset.request = request
viewset.format_kwarg = None

response = viewset.balances(request)

print(f"Status: {response.status_code}\n")

if response.status_code == 200:
    print("Balances:")
    for bal in response.data['balances']:
        leave_type = bal['leave_type']
        balance = bal['balance']
        
        # Highlight LOP
        if 'LOP' in leave_type.upper():
            if balance == 0:
                print(f"  ✅ {leave_type}: {balance} (CORRECT - should be 0)")
            else:
                print(f"  ❌ {leave_type}: {balance} (WRONG - should be 0)")
        else:
            print(f"  {leave_type}: {balance}")
    
    # Check if LOP is 0
    lop_balance = next((b['balance'] for b in response.data['balances'] if 'LOP' in b['leave_type'].upper()), None)
    
    print("\n=== Verification ===")
    print(f"Leave allotment: 2")
    print(f"Approved leave requests: 0")
    print(f"Expected LOP: 0")
    print(f"Actual LOP: {lop_balance}")
    
    if lop_balance == 0:
        print("\n✅ SUCCESS! LOP calculation is now correct.")
        print("   LOP only counts when approved leave requests exceed allotment.")
        print("   Absences in attendance system are tracked separately.")
    else:
        print(f"\n❌ FAILED! LOP is still {lop_balance} instead of 0.")
else:
    print(f"Error: {response.data}")

print()
