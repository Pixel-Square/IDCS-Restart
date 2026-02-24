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

# Get staff
staff1 = StaffProfile.objects.filter(staff_id='3171007').first()
if not staff1:
    print("Staff not found!")
    sys.exit(1)

print(f"Staff: {staff1} (ID={staff1.id})")
print()

# Get all TeachingAssignments for this staff
tas = TeachingAssignment.objects.filter(
    staff=staff1,
    is_active=True
).select_related('section', 'curriculum_row', 'elective_subject')

print(f"=== TEACHING ASSIGNMENTS ({tas.count()}) ===")
for ta in tas:
    section_name = f"{ta.section} (ID={ta.section.id})" if ta.section else "No section (global)"
    print(f"  Section: {section_name}")
    print(f"    CurrRow: {ta.curriculum_row}")
    print(f"    Elective: {ta.elective_subject}")
    print()

# Get TimetableAssignments where this staff is mapped
print(f"=== TIMETABLE ASSIGNMENTS (Direct staff={staff1.id}) ===")
direct = TimetableAssignment.objects.filter(staff=staff1).select_related('section', 'period').order_by('section__id', 'day', 'period__index')[:10]
print(f"Found {TimetableAssignment.objects.filter(staff=staff1).count()} total")
for a in direct[:10]:
    print(f"  Section {a.section.id} ({a.section}), Day {a.day}, Period {a.period.id}: {a.subject_text or a.curriculum_row}")

# Now check what sections have TimetableAssignments with matching curriculum_rows
print(f"\n=== SECTIONS WITH MATCHING CURRICULUM IN TIMETABLE ===")
for ta in tas:
    if ta.curriculum_row:
        matching_tts = TimetableAssignment.objects.filter(
            curriculum_row=ta.curriculum_row
        ).values('section__id', 'section__name', 'day').distinct()
        if matching_tts.exists():
            print(f"  CurrRow {ta.curriculum_row}:")
            for mt in matching_tts[:5]:
                print(f"    Section {mt['section__id']} ({mt['section__name']}), Day {mt['day']}")
