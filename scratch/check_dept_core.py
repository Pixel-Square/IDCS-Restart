import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumMaster, CurriculumDepartment

print("=== CurriculumMaster with is_dept_core=True ===")
masters = CurriculumMaster.objects.filter(is_dept_core=True)
for m in masters:
    print(f"Master ID: {m.id} | Code: {m.course_code} | Name: {m.course_name} | Reg: {m.regulation} | Depts: {[d.code for d in m.departments.all()]} | ForAllDepts: {m.for_all_departments}")

print("\n=== CurriculumDepartment with is_dept_core=True ===")
dept_rows = CurriculumDepartment.objects.filter(is_dept_core=True)
for d in dept_rows:
    print(f"DeptRow ID: {d.id} | Master ID: {d.master_id} | Dept: {d.department.code} | Code: {d.course_code} | Name: {d.course_name} | Reg: {d.regulation}")
