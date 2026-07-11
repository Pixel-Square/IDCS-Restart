import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Section

sec = Section.objects.get(pk=47)
print(f"Section G Semester: {sec.semester.number if sec.semester else None}")
