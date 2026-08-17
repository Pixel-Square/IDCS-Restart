import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumDepartment

rows = CurriculumDepartment.objects.filter(is_dept_core=True)
print(f"Total is_dept_core=True: {rows.count()}")
for r in rows:
    print(f"ID: {r.id} | Code: {r.course_code} | Name: {r.course_name} | Dept: {r.department.short_name} | Sem: {r.semester.number}")
