import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from timetable.views import CurriculumBySectionView
from rest_framework.test import APIRequestFactory, force_authenticate

User = get_user_model()
u = User.objects.filter(username__iexact='RAJKUMAR T').first()

factory = APIRequestFactory()
request = factory.get('/api/timetable/curriculum-for-section/?section_id=61')
force_authenticate(request, user=u)

response = CurriculumBySectionView.as_view()(request)

print(f"Status Code: {response.status_code}")
print("Response Data:", response.data)
