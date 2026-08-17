import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from timetable.models import TimetableAssignment

print("=== Timetable Assignments matching Engineering Graphics ===")
tas = TimetableAssignment.objects.filter(curriculum_row__course_code='GEA1105')
if not tas.exists():
    tas = TimetableAssignment.objects.filter(subject_text__icontains='Graphics')

print(f"Total assignments: {tas.count()}")
for ta in tas:
    cr = ta.curriculum_row
    print(f"TA ID: {ta.id} | Section: {ta.section.id} ({ta.section.name} | {ta.section.batch.name}) | Day: {ta.day} | SubjectText: {ta.subject_text} | CurRow ID: {cr.id if cr else None} | Dept: {cr.department.code if cr and cr.department else None} | Staff: {[s.user.username for s in ta.staff_list.all()] if hasattr(ta, 'staff_list') else ta.staff}")
