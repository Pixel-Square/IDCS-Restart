import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Department, Section, TeachingAssignment, StudentSectionAssignment
from curriculum.models import CurriculumDepartment

print("=== Departments ===")
for d in Department.objects.all():
    print(f"ID: {d.id} | Code: {d.code} | Name: {d.name} | is_sh_main: {getattr(d, 'is_sh_main', False)}")

print("\n=== S&H Sections ===")
sh_dept = Department.objects.filter(code="S&H").first()
if sh_dept:
    sections = Section.objects.filter(managing_department=sh_dept)
    for s in sections:
        print(f"Section ID: {s.id} | Name: {s.name} | Dept: {s.managing_department.code if s.managing_department else 'None'} | Regulation: {s.batch.regulation.code if s.batch and s.batch.regulation else 'None'}")
        
        # Check teaching assignments for this section
        tas = TeachingAssignment.objects.filter(section=s, is_active=True).select_related('staff__user', 'curriculum_row')
        print(f"  Teaching Assignments count: {tas.count()}")
        for ta in tas:
            cr_code = ta.curriculum_row.course_code if ta.curriculum_row else "None"
            cr_name = ta.curriculum_row.course_name if ta.curriculum_row else "None"
            staff_name = f"{ta.staff.user.first_name} {ta.staff.user.last_name}" if ta.staff.user else ta.staff.staff_id
            print(f"    TA ID: {ta.id} | Staff: {staff_name} | Subject: {cr_code} - {cr_name}")
else:
    print("S&H Department not found!")
