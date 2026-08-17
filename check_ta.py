import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import TeachingAssignment
from curriculum.models import CurriculumDepartment, ElectiveSubject

empty_tas = TeachingAssignment.objects.filter(section__isnull=True).select_related("curriculum_row", "elective_subject", "staff", "staff__user")

print(f"Total empty TAs: {empty_tas.count()}")
for ta in empty_tas:
    row = ta.curriculum_row
    elec = ta.elective_subject
    subject_name = ""
    dept = ""
    if row:
        subject_name = f"Row: {row.course_code}"
        dept = row.department.code if getattr(row, "department", None) else getattr(row.master, "category", "")
    elif elec:
        subject_name = f"Elective: {elec.course_code}"
        dept = getattr(elec, "department", None)
        if dept is None:
            parent = getattr(elec, "parent", None)
            dept = getattr(parent, "department", None)
        dept = dept.code if hasattr(dept, "code") else str(dept)
    
    first_name = getattr(ta.staff.user, "first_name", "") if getattr(ta.staff, "user", None) else ""
    print(f"TA {ta.id} | Staff: {ta.staff.staff_id} {first_name} | Subj: {subject_name} | Dept: {dept}")
