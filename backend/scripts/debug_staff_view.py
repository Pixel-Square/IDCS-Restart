import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import TimetableAssignment
from academics.models import StaffProfile, TeachingAssignment, Section
from django.db.models import Q

# Get the staff profiles
staff1 = StaffProfile.objects.filter(staff_id='3171007').first()
staff2 = StaffProfile.objects.filter(staff_id='3171022').first()

print("=== STAFF PROFILES ===")
print(f"Staff 3171007: {staff1} (ID={staff1.id if staff1 else None})")
print(f"Staff 3171022: {staff2} (ID={staff2.id if staff2 else None})")
print()

# Get the section
section = Section.objects.filter(name__contains='Artificial Intelligence').filter(name__contains='2023').first()
print(f"=== TARGET SECTION ===")
print(f"Section: {section} (ID={section.id if section else None})")
print()

if not section or not staff1:
    print("Missing data!")
    sys.exit(1)

# Check TimetableAssignments for staff1 on Sunday (day 7)
print(f"=== TIMETABLE ASSIGNMENTS FOR STAFF 3171007 (Direct) ===")
direct_assignments = TimetableAssignment.objects.filter(
    section=section,
    day=7,
    staff=staff1
).select_related('period', 'curriculum_row')

print(f"Found {direct_assignments.count()} direct assignments")
for a in direct_assignments:
    print(f"  Period {a.period.id} ({a.period.label}): {a.subject_text or a.curriculum_row}")

# Check if they would match via TeachingAssignment logic
print(f"\n=== TEACHING ASSIGNMENTS FOR STAFF 3171007 ===")
tas = TeachingAssignment.objects.filter(
    staff=staff1,
    is_active=True
).filter(
    Q(section=section) | Q(section__isnull=True)
).select_related('curriculum_row', 'elective_subject')

print(f"Found {tas.count()} teaching assignments")
for ta in tas:
    print(f"  TA: {ta.curriculum_row} (Elective: {ta.elective_subject})")

# Check what TimetableAssignments exist for this section on day 7
print(f"\n=== ALL TIMETABLE ASSIGNMENTS FOR SECTION ON DAY 7 ===")
all_assignments = TimetableAssignment.objects.filter(
    section=section,
    day=7
).select_related('period', 'staff', 'curriculum_row').order_by('period__index')

print(f"Found {all_assignments.count()} assignments")
for a in all_assignments:
    print(f"  Period {a.period.id} ({a.period.label}): Staff={a.staff}, CurrRow={a.curriculum_row}, Subject={a.subject_text}")

# Now check what the StaffTimetableView logic would return
print(f"\n=== TESTING STAFFTIMETABLEVIEW LOGIC ===")
print(f"Testing for Staff 3171007...")

# Replicate the subquery logic
from django.db.models import Exists, OuterRef
ta_qs = TeachingAssignment.objects.filter(
    staff=staff1,
    is_active=True,
).filter(
    (Q(section=OuterRef('section')) | Q(section__isnull=True)) &
    (Q(curriculum_row=OuterRef('curriculum_row')) | Q(elective_subject__parent=OuterRef('curriculum_row')))
)

qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'section', 'section__batch')
qs = qs.annotate(has_ta=Exists(ta_qs)).filter(
    Q(staff=staff1) | Q(staff__isnull=True, has_ta=True)
).filter(section=section, day=7)

print(f"Query would return {qs.count()} assignments")
for a in qs:
    print(f"  Period {a.period.id} ({a.period.label}): Staff={a.staff}, CurrRow={a.curriculum_row}, has_ta={a.has_ta}")
