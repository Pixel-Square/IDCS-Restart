import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumDepartment

print("=== CurriculumDepartment Semester 2 ===")
rows = CurriculumDepartment.objects.filter(semester__number=2, regulation='R2023')
for r in rows:
    print(f"ID: {r.id} | Dept: {r.department.code} | Code: {r.course_code} | Name: {r.course_name} | IsElective: {r.is_elective} | IsDeptCore: {r.is_dept_core}")
