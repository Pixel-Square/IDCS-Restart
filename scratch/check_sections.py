import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Section

print("=== Sections G-K ===")
secs = Section.objects.filter(name__in=['G', 'H', 'I', 'J', 'K'])
for s in secs:
    dept = s.batch.course.department if s.batch and s.batch.course else None
    print(f"Sec ID: {s.id} | Name: {s.name} | Batch: {s.batch.name if s.batch else None} | Dept: {dept.code if dept else None} ({dept.id if dept else None})")
