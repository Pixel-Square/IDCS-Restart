import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import SpecialTimetable, SpecialTimetableEntry, TimetableAssignment
from academics.models import StaffProfile, TeachingAssignment

# Get the swap and its section
swap = SpecialTimetable.objects.filter(name__startswith='[SWAP]').order_by('-created_at').first()
if not swap:
    print("No swap found")
    sys.exit(1)

section = swap.section
print(f'Section: {section} (ID={section.id})')
print(f'Swap: {swap.name}')

# Get swap entries
entries = SpecialTimetableEntry.objects.filter(timetable=swap, is_active=True)
print(f'\nSwap entries ({entries.count()}):')
for e in entries:
    print(f'  Date: {e.date}, Day: {e.date.isoweekday()}, Period {e.period.id} ({e.period.label}): Staff={e.staff}, Subject={e.subject_text}')

# Get Sunday (day 7) assignments
day_of_week = entries.first().date.isoweekday() if entries.first() else 7
print(f'\nDay {day_of_week} assignments for this section:')
assignments = TimetableAssignment.objects.filter(section=section, day=day_of_week).select_related('period', 'staff', 'curriculum_row').order_by('period__index')
for a in assignments:
    print(f'  Period {a.period.id} ({a.period.label}): Staff={a.staff}, Subject={a.subject_text}, CurrRow={a.curriculum_row}')

# Check the specific staff IDs
staff1 = StaffProfile.objects.filter(staff_id='3171007').first()
staff2 = StaffProfile.objects.filter(staff_id='3171022').first()

print(f'\nStaff profiles:')
print(f'  Staff 3171007: {staff1} (ID={staff1.id if staff1 else None})')
print(f'  Staff 3171022: {staff2} (ID={staff2.id if staff2 else None})')

if staff1:
    a1 = assignments.filter(staff=staff1)
    print(f'\n  Staff 3171007 periods on day {day_of_week}:')
    for a in a1:
        print(f'    Period {a.period.id}: {a.subject_text}')
        
if staff2:
    a2 = assignments.filter(staff=staff2)
    print(f'\n  Staff 3171022 periods on day {day_of_week}:')
    for a in a2:
        print(f'    Period {a.period.id}: {a.subject_text}')

# Check TeachingAssignments
print(f'\nTeachingAssignments:')
if staff1:
    ta1 = TeachingAssignment.objects.filter(staff=staff1, is_active=True, section=section)
    print(f'  Staff 3171007: {ta1.count()} assignments')
    for ta in ta1:
        print(f'    - CurrRow={ta.curriculum_row}, Elective={ta.elective_subject}')
        
if staff2:
    ta2 = TeachingAssignment.objects.filter(staff=staff2, is_active=True, section=section)
    print(f'  Staff 3171022: {ta2.count()} assignments')
    for ta in ta2:
        print(f'    - CurrRow={ta.curriculum_row}, Elective={ta.elective_subject}')
