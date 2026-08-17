import os, sys, json
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
import django
django.setup()
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from academics.models import Section
User = get_user_model()
u = User.objects.filter(is_superuser=True).first()
client = APIClient()
client.force_authenticate(user=u)

sections = Section.objects.filter(batch__department__code='S&H')
for sec in sections:
    res = client.get(f'/api/timetable/curriculum-for-section/?section_id={sec.id}')
    items = res.json().get('results', [])
    tamils = [c for c in items if 'Tamil' in str(c)]
    if len(tamils) > 1:
        print(f"Section {sec.name} ({sec.id}) has {len(tamils)} Tamils and Technology!")
        for t in tamils:
            print(f"  {t['id']}: {t['course_code']} - {t['course_name']} (Dept Core: {t['is_dept_core']})")
    elif len(tamils) == 1:
        print(f"Section {sec.name} ({sec.id}) has 1.")
    else:
        print(f"Section {sec.name} ({sec.id}) has 0.")
