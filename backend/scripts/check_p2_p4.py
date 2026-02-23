from timetable.models import TimetableAssignment
from academics.models import Section

sec = Section.objects.get(pk=1)
day = 7  # Sunday

p2 = TimetableAssignment.objects.filter(section=sec, period_id=2, day=day).first()
p4 = TimetableAssignment.objects.filter(section=sec, period_id=4, day=day).first()

print("\nCurrent assignments on Sunday:")
print(f"Period 2: {p2.curriculum_row.course_code if p2 and p2.curriculum_row else 'None'} (Staff: {p2.staff if p2 else 'None'})")
print(f"Period 4: {p4.curriculum_row.course_code if p4 and p4.curriculum_row else 'None'} (Staff: {p4.staff if p4 else 'None'})")

print("\nIf we swap Period 2 & 4:")
print(f"Period 2 should become: {p4.curriculum_row.course_code if p4 and p4.curriculum_row else 'None'}")
print(f"Period 4 should become: {p2.curriculum_row.course_code if p2 and p2.curriculum_row else 'None'}")
