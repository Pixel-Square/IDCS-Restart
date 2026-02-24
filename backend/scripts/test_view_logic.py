import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import TimetableAssignment
from academics.models import StaffProfile, TeachingAssignment
from django.db.models import Q, Exists, OuterRef
import datetime

# Get staff
staff1 = StaffProfile.objects.filter(staff_id='3171007').first()
section_id = 1

print(f"Testing StaffTimetableView logic for Staff {staff1} (ID={staff1.id})")
print(f"Section ID: {section_id}\n")

# Replicate the exact view logic
ta_qs = TeachingAssignment.objects.filter(
    staff=staff1,
    is_active=True,
).filter(
    (Q(section=OuterRef('section')) | Q(section__isnull=True)) &
    (Q(curriculum_row=OuterRef('curriculum_row')) | Q(elective_subject__parent=OuterRef('curriculum_row')))
)

qs = TimetableAssignment.objects.select_related(
    'period', 'staff', 'curriculum_row', 'section', 'section__batch'
)
qs = qs.annotate(has_ta=Exists(ta_qs)).filter(
    Q(staff=staff1) | Q(staff__isnull=True, has_ta=True)
)

print(f"=== ALL ASSIGNMENTS FOR THIS STAFF (all sections, all days) ===")
print(f"Total count: {qs.count()}")

# Group by section and day
results_by_section = {}
for a in qs:
    key = (a.section.id, a.section, a.day)
    if key not in results_by_section:
        results_by_section[key] = []
    results_by_section[key].append(a)

for (sec_id, sec_name, day), assignments in sorted(results_by_section.items()):
    print(f"\nSection {sec_id} ({sec_name}), Day {day}:")
    for a in sorted(assignments, key=lambda x: x.period.index):
        print(f"  Period {a.period.id} ({a.period.label}): {a.curriculum_row}, has_ta={a.has_ta}")

# Now test for a specific date (Sunday 2026-03-01)
test_date = datetime.date(2026, 3, 1)
day_of_week = test_date.isoweekday()
print(f"\n=== TESTING FOR DATE: {test_date} (Day {day_of_week}) ===")

day_assignments = qs.filter(day=day_of_week, section_id=section_id)
print(f"Found {day_assignments.count()} assignments")
for a in day_assignments:
    print(f"  Period {a.period.id} ({a.period.label}): {a.curriculum_row}")
