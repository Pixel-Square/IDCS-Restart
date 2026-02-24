from timetable.models import TimetableAssignment
from academics.models import Section
import datetime

sec = Section.objects.get(pk=1)
date = datetime.date(2026, 2, 28)
day_of_week = date.isoweekday()  # 1=Mon, 7=Sun

print(f"\n2026-02-28 is day {day_of_week} ({['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][day_of_week-1]})")

assigns = TimetableAssignment.objects.filter(
    section=sec, day=day_of_week
).select_related('period', 'curriculum_row').order_by('period__index')

print(f"\nAssignments for section 1 on {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][day_of_week-1]}:")
for a in assigns:
    if not (a.period.is_break or a.period.is_lunch):
        subj = a.curriculum_row.course_code if a.curriculum_row else a.subject_text or "?"
        print(f"  Period {a.period.index} (ID={a.period.id}): {subj}")

p2 = TimetableAssignment.objects.filter(section=sec, period_id=2, day=day_of_week).first()
p4 = TimetableAssignment.objects.filter(section=sec, period_id=4, day=day_of_week).first()

print(f"\nPeriod 2: {p2.curriculum_row.course_code if p2 and p2.curriculum_row else 'NOT FOUND'}")
print(f"Period 4: {p4.curriculum_row.course_code if p4 and p4.curriculum_row else 'NOT FOUND'}")
