import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumMaster, CurriculumDepartment
from academics.models import Department, TeachingAssignment, Section

print("=== CurriculumMaster matching 'graphics' or 'GEA' ===")
for m in CurriculumMaster.objects.filter(course_name__icontains='graphics') | CurriculumMaster.objects.filter(course_code__icontains='GEA'):
    print(f"ID: {m.id} | Code: {m.course_code} | Name: {m.course_name} | Regulation: {m.regulation} | IsElective: {m.is_elective} | IsDeptCore: {m.is_dept_core}")

print("\n=== CurriculumDepartment matching 'graphics' or 'GEA' ===")
for cd in CurriculumDepartment.objects.filter(course_name__icontains='graphics') | CurriculumDepartment.objects.filter(course_code__icontains='GEA'):
    print(f"ID: {cd.id} | Code: {cd.course_code} | Name: {cd.course_name} | Dept: {cd.department.code if cd.department else None} ({cd.department.id if cd.department else None}) | IsElective: {cd.is_elective} | IsDeptCore: {cd.is_dept_core} | Sem: {cd.semester.number if cd.semester else None}")
