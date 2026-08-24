import os
import sys

sys.path.insert(0, '/home/iqac2/Desktop/idcs-mt/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

import django
django.setup()

from curriculum.models import CurriculumDepartment, DepartmentGroup, DepartmentGroupMapping
from academics.models import TeachingAssignment, Department
from academics.services_marks_export import _resolve_semester_no, _resolve_dept_name

# Check all Semester 2 CurriculumDepartments
sem2_rows = CurriculumDepartment.objects.filter(semester__icontains='2')
print(f"Total CurriculumDepartment rows matching '2': {sem2_rows.count()}")
for r in sem2_rows[:20]:
    dept_name = _resolve_dept_name(r.department) if r.department else "None"
    tas = TeachingAssignment.objects.filter(curriculum_row=r)
    print(f"  ID {r.id}: {r.course_code} - {r.course_name} | sem='{r.semester}' (parsed={_resolve_semester_no(r.semester)}) | dept={dept_name} | TAs={tas.count()}")
    for ta in tas:
        staff_dept = ta.staff.primary_department.name if (ta.staff and getattr(ta.staff, 'primary_department', None)) else "None"
        print(f"    TA {ta.id}: Sec {ta.section.name if ta.section else 'All'} | Staff Dept: {staff_dept}")

# Check DepartmentGroupMappings
print("\n=== DepartmentGroupMappings ===")
for dgm in DepartmentGroupMapping.objects.all().select_related('group', 'department'):
    print(f"  Group: {dgm.group.name} -> Dept: {dgm.department.name} ({dgm.department.code})")

# Check all TAs with academic_year is_active or 2025-2026
print("\n=== All TAs for Sem 2 courses ===")
for ta in TeachingAssignment.objects.filter(curriculum_row__semester__icontains='2'):
    cr = ta.curriculum_row
    s_no = _resolve_semester_no(cr.semester)
    print(f"  TA {ta.id}: code={cr.course_code}, name={cr.course_name}, sem={s_no}, dept={cr.department.name if cr.department else 'N/A'}")
