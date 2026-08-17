import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumMaster

rows = CurriculumMaster.objects.filter(course_code='GEA1105')
print(f"Total master GEA1105 rows: {rows.count()}")
for r in rows:
    print(f"ID: {r.id} | Reg: {r.regulation} | Sem: {r.semester.number} | is_dept_core: {r.is_dept_core}")
