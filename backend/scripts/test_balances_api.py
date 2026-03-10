import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from django.test import RequestFactory
from rest_framework.test import force_authenticate
from accounts.models import User
from staff_requests.views import StaffRequestViewSet
import json

# Get HR user
hr_user = User.objects.filter(roles__name='HR').first()

if not hr_user:
    print("No HR user found")
    sys.exit(1)

print(f"=== Testing /api/staff-requests/requests/balances/ for {hr_user.username} ===\n")

# Create a mock request
factory = RequestFactory()
request = factory.get('/api/staff-requests/requests/balances/')
force_authenticate(request, user=hr_user)

# Call the balances action
view = StaffRequestViewSet()
view.action = 'balances'
view.request = request
view.format_kwarg = None

response = view.balances(request)

print("Status Code:", response.status_code)
print("\nResponse Data:")
print(json.dumps(response.data, indent=2, default=str))
