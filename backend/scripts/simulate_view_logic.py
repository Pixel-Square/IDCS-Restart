import os
import sys
import django
import datetime

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import TimetableAssignment, SpecialTimetableEntry, SpecialTimetable
from academics.models import StaffProfile, TeachingAssignment
from django.db.models import Q, Exists, OuterRef

# Get staff
staff = StaffProfile.objects.filter(staff_id='3171007').first()
print(f"Testing for Staff: {staff}\n")

# Get date range for the week containing March 1, 2026 (Sunday)
target_date = datetime.date(2026, 3, 1)  # Sunday
monday = target_date - datetime.timedelta(days=target_date.weekday())
sunday = monday + datetime.timedelta(days=6)

print(f"Week range: {monday} to {sunday}")
print(f"Target date: {target_date} (day {target_date.isoweekday()})\n")

# Step 1: Get normal assignments using the view's logic
print("=== STEP 1: NORMAL ASSIGNMENTS ===")
ta_qs = TeachingAssignment.objects.filter(
    staff=staff,
    is_active=True,
).filter(
    (Q(section=OuterRef('section')) | Q(section__isnull=True)) &
    (Q(curriculum_row=OuterRef('curriculum_row')) | Q(elective_subject__parent=OuterRef('curriculum_row')))
)

qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'section')
qs = qs.annotate(has_ta=Exists(ta_qs)).filter(
    Q(staff=staff) | Q(staff__isnull=True, has_ta=True)
)

# Filter for day 7 (Sunday)
sunday_assignments = qs.filter(day=7)
print(f"Found {sunday_assignments.count()} normal assignments for Sunday")
for a in sunday_assignments:
    print(f"  Period {a.period.id}: {a.curriculum_row}")

# Step 2: Check for special entries
print(f"\n=== STEP 2: SPECIAL ENTRIES (SWAPS) ===")
special_qs = SpecialTimetableEntry.objects.filter(
    is_active=True, 
    date__gte=monday, 
    date__lte=sunday
).filter(
    ~Q(timetable__name__startswith='[SWAP]') | Q(date__gte=datetime.date.today())
).select_related('timetable', 'timetable__section', 'period', 'staff', 'curriculum_row')

print(f"Found {special_qs.count()} special entries in week range")

for e in special_qs:
    print(f"\nProcessing special entry ID={e.id}:")
    print(f"  Timetable: {e.timetable.name}")
    print(f"  Section: {e.timetable.section}")
    print(f"  Date: {e.date} (day {e.date.isoweekday()})")
    print(f"  Period: {e.period.id}")
    print(f"  Subject: {e.subject_text}")
    
    # Check visibility logic
    is_swap_entry = e.timetable.name.startswith('[SWAP]')
    print(f"  is_swap: {is_swap_entry}")
    
    if is_swap_entry:
        # Test the visibility logic
        swap_section = e.timetable.section
        day_of_week = e.date.isoweekday()
        
        # Check direct assignment
        direct = TimetableAssignment.objects.filter(
            section=swap_section, day=day_of_week, staff=staff
        ).exists()
        print(f"  direct_assignment: {direct}")
        
        # Check indirect via TeachingAssignment
        staff_tas = TeachingAssignment.objects.filter(
            staff=staff, is_active=True
        ).filter(
            Q(section=swap_section) | Q(section__isnull=True)
        ).select_related('curriculum_row', 'elective_subject')
        
        day_tts = TimetableAssignment.objects.filter(
            section=swap_section, day=day_of_week
        ).select_related('curriculum_row')
        
        indirect = False
        for ta in staff_tas:
            ta_curr = ta.curriculum_row
            ta_elec_parent = ta.elective_subject.parent if ta.elective_subject else None
            
            for tt in day_tts:
                tt_curr = tt.curriculum_row
                if tt_curr and (tt_curr == ta_curr or tt_curr == ta_elec_parent):
                    indirect = True
                    print(f"  ✓ MATCH: TA {ta_curr} matches TT period {tt.period.id}")
                    break
            if indirect:
                break
        
        print(f"  indirect_assignment: {indirect}")
        print(f"  SHOULD SHOW: {direct or indirect}")

# Step 3: Check if normal assignments should be suppressed
print(f"\n=== STEP 3: SUPPRESSION CHECK ===")
for a in sunday_assignments:
    day_date = monday + datetime.timedelta(days=a.day - 1)
    has_special = SpecialTimetableEntry.objects.filter(
        timetable__section=a.section,
        period=a.period,
        date=day_date,
        is_active=True
    ).exists()
    
    if has_special:
        print(f"Period {a.period.id} should be SUPPRESSED (has special entry)")
    else:
        print(f"Period {a.period.id} should be SHOWN (no special entry)")
