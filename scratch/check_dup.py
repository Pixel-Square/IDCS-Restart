import os, sys, json
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
import django
django.setup()
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.filter(is_superuser=True).first()
client = APIClient()
client.force_authenticate(user=u)
res = client.get('/api/timetable/curriculum-for-section/?section_id=52')
data = res.json()
items = data.get('results', data)
for c in items:
    if 'Tamil' in str(c):
        print(c)
