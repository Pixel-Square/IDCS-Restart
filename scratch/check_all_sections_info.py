import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Section

print("=== All Sections ===")
for s in Section.objects.all().select_related('batch__course__department', 'batch__department', 'semester'):
    dept = s.batch.course.department if s.batch and s.batch.course else (s.batch.department if s.batch else None)
    print(f"Sec ID: {s.id} | Name: {s.name} | Batch: {s.batch.name if s.batch else None} | Dept: {dept.code if dept else None} ({dept.id if dept else None}) | Sem: {s.semester.number if s.semester else None}")
