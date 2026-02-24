import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import SpecialTimetable, SpecialTimetableEntry, TimetableAssignment
from academics.models import StaffProfile, TeachingAssignment
from django.db.models import Q

# Get the swap
swap = SpecialTimetable.objects.filter(name__startswith='[SWAP]').order_by('-created_at').first()
if not swap:
    print("No swap found")
    sys.exit(1)

section = swap.section
entries = SpecialTimetableEntry.objects.filter(timetable=swap, is_active=True)
first_entry = entries.first()
day_of_week = first_entry.date.isoweekday()

print(f'Testing swap visibility for: {swap.name}')
print(f'Section: {section}')
print(f'Day: {day_of_week} ({first_entry.date})')
print()

# Test for both staff
staff_ids = ['3171007', '3171022']
for staff_id in staff_ids:
    staff = StaffProfile.objects.filter(staff_id=staff_id).first()
    if not staff:
        print(f'Staff {staff_id}: NOT FOUND')
        continue
    
    print(f'=== Testing for Staff {staff_id} ({staff.user.get_full_name()}) ===')
    
    # Check direct assignment
    direct = TimetableAssignment.objects.filter(
        section=section, day=day_of_week, staff=staff
    ).exists()
    print(f'  Direct assignment: {direct}')
    
    # Check indirect via TeachingAssignment
    staff_tas = TeachingAssignment.objects.filter(
        staff=staff,
        is_active=True
    ).filter(
        Q(section=section) | Q(section__isnull=True)
    ).select_related('curriculum_row', 'elective_subject')
    
    print(f'  TeachingAssignments: {staff_tas.count()}')
    for ta in staff_tas:
        print(f'    - {ta.curriculum_row}')
    
    # Get timetable assignments for this day
    day_tts = TimetableAssignment.objects.filter(
        section=section,
        day=day_of_week
    ).select_related('curriculum_row')
    
    print(f'  Timetable assignments on day {day_of_week}: {day_tts.count()}')
    
    # Check matches
    indirect = False
    for ta in staff_tas:
        ta_curr = ta.curriculum_row
        ta_elec_parent = ta.elective_subject.parent if ta.elective_subject else None
        
        for tt in day_tts:
            tt_curr = tt.curriculum_row
            if tt_curr and (tt_curr == ta_curr or tt_curr == ta_elec_parent):
                print(f'    ✓ MATCH: TA {ta_curr} matches TT period {tt.period.id} ({tt_curr})')
                indirect = True
                break
        if indirect:
            break
    
    print(f'  Indirect assignment: {indirect}')
    print(f'  SHOULD SHOW SWAP: {direct or indirect}')
    print()
