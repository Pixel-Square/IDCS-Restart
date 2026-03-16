"""
Check current form schemas for all templates
"""
import os, sys, django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_requests.models import RequestTemplate

templates = RequestTemplate.objects.filter(is_active=True).exclude(name='Late Entry Permission')

for t in templates:
    print(f'\n=== {t.name} ===')
    for f in t.form_schema:
        print(f'  {f.get("name")}: {f.get("type")} - required={f.get("required", False)} - label={f.get("label")}')
