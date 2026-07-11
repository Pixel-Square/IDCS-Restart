import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Section, StudentSectionAssignment, StudentProfile
from curriculum.models import CurriculumDepartment
from timetable.views import CurriculumBySectionView

sec = Section.objects.get(pk=41)
print(f"Section: {sec.name}")
print(f"Batch course_id: {getattr(sec.batch, 'course_id', None)}")

home_dept_ids = list(
    StudentSectionAssignment.objects.filter(
        section=sec,
        end_date__isnull=True,
        section_type=StudentSectionAssignment.SECTION_TYPE_PRIMARY,
        student__home_department__isnull=False,
    ).values_list('student__home_department_id', flat=True).distinct()
)
print(f"PRIMARY home_dept_ids: {home_dept_ids}")

# Legacy fallback check
legacy_home_dept_ids = list(
    StudentProfile.objects.filter(
        section=sec,
        home_department__isnull=False,
    ).values_list('home_department_id', flat=True).distinct()
)
print(f"Legacy StudentProfile home_dept_ids: {legacy_home_dept_ids}")

managing_dept = getattr(sec, 'managing_department', None)
managing_dept_id = getattr(managing_dept, 'pk', None) if managing_dept else None
print(f"Managing dept ID: {managing_dept_id}")

all_dept_ids = list(set(home_dept_ids))
if managing_dept_id:
    all_dept_ids = list(set(all_dept_ids + [managing_dept_id]))
print(f"All dept IDs: {all_dept_ids}")

qs = CurriculumDepartment.objects.filter(
    department_id__in=all_dept_ids,
    semester__number=1,
)
print(f"CurriculumDepartment count for sem 1: {qs.count()}")
for c in qs[:10]:
    print(f"  {c.course_code} - {c.course_name} | Dept: {c.department.code} | Reg: {c.regulation}")
