import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from academics.views import HODSectionsView
from django.contrib.auth import get_user_model

User = get_user_model()
factory = APIRequestFactory()

def simulate_sections(username):
    user = User.objects.filter(username=username).first()
    if not user:
        print(f"User {username} not found")
        return
    print(f"\n=== Sections for {username} ===")
    request = factory.get('/api/academics/sections/', {'page_size': 0})
    force_authenticate(request, user=user)
    view = HODSectionsView.as_view()
    response = view(request)
    results = response.data.get('results', [])
    print(f"Total sections returned: {len(results)}")
    g_k = [r for r in results if r.get('name') in ['G', 'H', 'I', 'J', 'K']]
    print(f"Sections G-K returned ({len(g_k)}):")
    for r in g_k:
        print(f"  Sec ID: {r.get('id')} | Name: {r.get('name')} | Dept: {r.get('department_short_name')}")

simulate_sections("RAJKUMAR T")
simulate_sections("Oorkalan A")
