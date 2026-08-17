import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from academics.views import HODSectionsView
from rest_framework.test import APIRequestFactory

User = get_user_model()

def check_user_sections(username):
    u = User.objects.filter(username__iexact=username).first()
    if not u:
        print(f"User {username} not found")
        return
    factory = APIRequestFactory()
    request = factory.get('/api/academics/sections/?page_size=0')
    request.user = u
    view = HODSectionsView()
    view.request = request
    view.format_kwarg = None
    response = view.get(request)
    print(f"=== Sections returned for {username} ===")
    for sec in response.data['results']:
        print(f"  Sec ID: {sec['id']} | Name: {sec['name']} | Batch: {sec['batch_name']} | Dept: {sec['department_code']}")

check_user_sections('RAJKUMAR T')
check_user_sections('Oorkalan A')
