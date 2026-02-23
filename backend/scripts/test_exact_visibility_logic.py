import os
import sys
import django
import datetime

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import SpecialTimetable, SpecialTimetableEntry
from academics.models import StaffProfile
from django.db.models import Q

# Get staff
staff1 = StaffProfile.objects.filter(staff_id='3171007').first()
staff_profile = staff1

# Get the swap
swap = SpecialTimetable.objects.filter(name__startswith='[SWAP]').order_by('-created_at').first()

print(f"Testing StaffTimetableView logic for swap visibility")
print(f"Staff: {staff_profile}")
print(f"Swap: {swap}\n")

if not swap:
    print("No swap found")
    sys.exit(1)

# Get swap entries
entries = SpecialTimetableEntry.objects.filter(timetable=swap, is_active=True)
print(f"Swap has {entries.count()} entries:")
for e in entries:
    print(f"  Date: {e.date}, Period: {e.period.id}, Subject: {e.subject_text}, Staff: {e.staff}")

# Now test the visibility logic for each entry
print(f"\n=== TESTING VISIBILITY FOR STAFF {staff_profile.staff_id} ===")

for e in entries:
    print(f"\nEntry: Period {e.period.id}, Date {e.date}")
    
    # Check the logic from the view
    is_swap_entry = (getattr(e.timetable, 'name', '') or '').startswith('[SWAP]')
    print(f"  is_swap_entry: {is_swap_entry}")
    
    if is_swap_entry:
        try:
            from timetable.models import TimetableAssignment
            from academics.models import TeachingAssignment
            
            swap_section = getattr(e.timetable, 'section', None)
            print(f"  swap_section: {swap_section}")
            
            if swap_section:
                day_of_week = e.date.isoweekday()
                print(f"  day_of_week: {day_of_week}")
                
                # Check direct staff assignments
                direct_assignment = TimetableAssignment.objects.filter(
                    section=swap_section, day=day_of_week, staff=staff_profile
                ).exists()
                print(f"  direct_assignment: {direct_assignment}")
                
                # Check indirect assignments via TeachingAssignment
                indirect_assignment = False
                
                # Get all teaching assignments for this staff in this section
                staff_tas = TeachingAssignment.objects.filter(
                    staff=staff_profile,
                    is_active=True
                ).filter(
                    Q(section=swap_section) | Q(section__isnull=True)
                ).select_related('curriculum_row', 'elective_subject')
                
                print(f"  staff_tas count: {staff_tas.count()}")
                for ta in staff_tas:
                    print(f"    TA: {ta.curriculum_row}, Elective: {ta.elective_subject}")
                
                # Get all timetable assignments for this section on this day
                day_tts = TimetableAssignment.objects.filter(
                    section=swap_section,
                    day=day_of_week
                ).select_related('curriculum_row')
                
                print(f"  day_tts count: {day_tts.count()}")
                for tt in day_tts:
                    print(f"    TT: Period {tt.period.id}, {tt.curriculum_row}")
                
                # Check if any TA matches any TT
                for ta in staff_tas:
                    ta_curr = ta.curriculum_row
                    ta_elec_parent = ta.elective_subject.parent if ta.elective_subject else None
                    
                    for tt in day_tts:
                        tt_curr = tt.curriculum_row
                        # Match if curriculum rows match or if TA elective's parent matches TT curriculum
                        if tt_curr and (tt_curr == ta_curr or tt_curr == ta_elec_parent):
                            print(f"    ✓ MATCH: TA {ta_curr} matches TT period {tt.period.id}")
                            indirect_assignment = True
                            break
                    if indirect_assignment:
                        break
                
                print(f"  indirect_assignment: {indirect_assignment}")
                print(f"  SHOULD SHOW: {direct_assignment or indirect_assignment}")
                
        except Exception as ex:
            print(f"  Exception: {ex}")
            import traceback
            traceback.print_exc()
