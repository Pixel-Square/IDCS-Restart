import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from timetable.models import TimetableAssignment

print("=== Timetable Assignments for Section 41 (S&H A) ===")
tas = TimetableAssignment.objects.filter(section_id=41)
print(f"Total: {tas.count()}")
for ta in tas:
    cr = ta.curriculum_row
    print(f"ID: {ta.id} | Day: {ta.day} | Period: {ta.period} | Subject: {ta.subject_text} | CurRow ID: {cr.id if cr else None} | CurRow Dept: {cr.department.code if cr and cr.department else None} | CurRow Code: {cr.course_code if cr else None} | Staff: {ta.staff.user.username if ta.staff else None}")
