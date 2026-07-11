import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumDepartment, CurriculumMaster

m = CurriculumMaster.objects.get(id=96)
print(f"Master ID: {m.id} | Code: {m.course_code} | Name: {m.course_name} | Depts: {[d.code for d in m.departments.all()]}")

rows = CurriculumDepartment.objects.filter(master=m)
print(f"\nTotal CurriculumDepartment rows for master 96: {rows.count()}")
for r in rows:
    print(f"ID: {r.id} | Dept: {r.department.code} | Code: {r.course_code} | Name: {r.course_name} | IsElective: {r.is_elective} | IsDeptCore: {r.is_dept_core}")
