import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumMaster, CurriculumDepartment

print("=== CurriculumMaster matching 'graphics' ===")
masters = CurriculumMaster.objects.filter(course_name__icontains='graphics')
for m in masters:
    print(f"ID: {m.id} | Code: {m.course_code} | Name: {m.course_name} | Reg: {m.regulation} | IsElective: {m.is_elective} | IsDeptCore: {m.is_dept_core} | Depts: {[d.code for d in m.departments.all()]}")

print("\n=== CurriculumDepartment matching 'graphics' ===")
dept_rows = CurriculumDepartment.objects.filter(course_name__icontains='graphics')
for d in dept_rows:
    print(f"ID: {d.id} | Code: {d.course_code} | Name: {d.course_name} | Dept: {d.department.code} ({d.department.id}) | IsElective: {d.is_elective} | IsDeptCore: {d.is_dept_core}")
