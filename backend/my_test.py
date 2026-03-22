import os, sys, django, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.test import RequestFactory
from accounts.models import User
from academics.views import StudentMarksView
user = User.objects.filter(studentprofile__isnull=False).last()
if not user:
    print("NO USER!")
    sys.exit()
req = RequestFactory().get('/api/academics/student/marks/')
req.user = user
resp = StudentMarksView.as_view()(req)
print(json.dumps(resp.data, indent=2)[:3000])
