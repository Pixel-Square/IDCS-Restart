import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import TimetableAssignment, SpecialTimetable, SpecialTimetableEntry, TimetableSlot
from academics.models import Section
import datetime

# Get section 1
section = Section.objects.get(id=1)
print(f"Section: {section}\n")

# Get Sunday (day 7) assignments
test_date = datetime.date(2026, 3, 1)  # Sunday
day_of_week = test_date.isoweekday()

assignments = TimetableAssignment.objects.filter(
    section=section,
    day=day_of_week
).select_related('period', 'curriculum_row').order_by('period__index')

print(f"=== SUNDAY (Day {day_of_week}) ASSIGNMENTS ===")
for a in assignments:
    is_break = a.period.is_break or a.period.is_lunch
    print(f"Period {a.period.id} (index={a.period.index}, {a.period.label}): {a.curriculum_row} {'[BREAK]' if is_break else ''}")

# Create a swap between period 1 and period 4 (teaching periods 1 and 3)
print(f"\n=== CREATING SWAP ===")
print(f"Swapping Period 1 and Period 4 on {test_date}")

period1 = TimetableSlot.objects.get(id=1)
period4 = TimetableSlot.objects.get(id=4)

# Get the assignments
ass1 = assignments.get(period=period1)
ass4 = assignments.get(period=period4)

print(f"  Period 1: {ass1.curriculum_row}")
print(f"  Period 4: {ass4.curriculum_row}")

# Create special timetable
swap_name = f"[SWAP] {test_date}"
special_tt = SpecialTimetable.objects.create(
    section=section,
    name=swap_name,
    created_by=None
)

# Create entries (swapped)
entry1 = SpecialTimetableEntry.objects.create(
    timetable=special_tt,
    period=period1,
    date=test_date,
    curriculum_row=ass4.curriculum_row,
    subject_text=str(ass4.curriculum_row.course_code) if ass4.curriculum_row else None,
    staff=None,
    is_active=True
)

entry2 = SpecialTimetableEntry.objects.create(
    timetable=special_tt,
    period=period4,
    date=test_date,
    curriculum_row=ass1.curriculum_row,
    subject_text=str(ass1.curriculum_row.course_code) if ass1.curriculum_row else None,
    staff=None,
    is_active=True
)

print(f"\n✓ Swap created successfully!")
print(f"  Special Timetable ID: {special_tt.id}")
print(f"  Entry 1 ID: {entry1.id}")
print(f"  Entry 2 ID: {entry2.id}")
