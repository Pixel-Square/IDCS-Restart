import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from curriculum.views import CurriculumDepartmentViewSet
from rest_framework.test import APIRequestFactory, force_authenticate

User = get_user_model()
u = User.objects.filter(username__iexact='RAJKUMAR T').first()

factory = APIRequestFactory()
request = factory.get('/api/curriculum/department/?page_size=0')
force_authenticate(request, user=u)

view = CurriculumDepartmentViewSet.as_view({'get': 'list'})
response = view(request)

results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data

# Find the row with ID 518 in the response data
row_518 = None
for r in results:
    if r['id'] == 518:
        row_518 = r
        break

print("=== Serialized Row 518 ===")
import pprint
pprint.pprint(row_518)
