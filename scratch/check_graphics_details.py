import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumMaster, CurriculumDepartment

print("=== CurriculumMaster ===")
masters = CurriculumMaster.objects.filter(course_code__icontains='GEA1105')
if not masters.exists():
    masters = CurriculumMaster.objects.filter(course_name__icontains='graphics')

for m in masters:
    print(f"Master ID: {m.id} | Code: {m.course_code} | Name: {m.course_name} | Reg: {m.regulation} | IsElective: {m.is_elective} | IsDeptCore: {m.is_dept_core} | Depts: {[d.code for d in m.departments.all()]} | ForAllDepts: {m.for_all_departments}")

print("\n=== CurriculumDepartment ===")
dept_rows = CurriculumDepartment.objects.filter(course_code__icontains='GEA1105')
if not dept_rows.exists():
    dept_rows = CurriculumDepartment.objects.filter(course_name__icontains='graphics')

for d in dept_rows:
    print(f"DeptRow ID: {d.id} | Master ID: {d.master_id} | Dept: {d.department.code} | Code: {d.course_code} | Name: {d.course_name} | Reg: {d.regulation} | IsElective: {d.is_elective} | IsDeptCore: {d.is_dept_core}")
