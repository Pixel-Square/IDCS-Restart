import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Department
for d in Department.objects.all():
    print(f"ID: {d.id} | Code: {d.code} | Name: {d.name}")
