import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Section

sec = Section.objects.get(id=1)
print(f"Section 1: ID: {sec.id} | Name: {sec.name}")
print(f"  Batch: {sec.batch} (ID: {sec.batch_id})")
print(f"  Department ID: {getattr(sec, 'department_id', None)}")
print(f"  Department Short Name: {getattr(sec, 'department_short_name', None)}")
print(f"  Attributes: {sec.__dict__}")
