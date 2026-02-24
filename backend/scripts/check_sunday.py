from timetable.models import TimetableSlot, TimetableAssignment, SpecialTimetableEntry
from academics.models import Section

section = Section.objects.get(pk=1)
day = 7  # Sunday

print(f"\n{'='*80}")
print(f"SUNDAY (Day {day}) SCHEDULE FOR: {section}")
print(f"{'='*80}\n")

assigns = TimetableAssignment.objects.filter(
    section=section, day=day
).select_related('period', 'curriculum_row').order_by('period__index')

print("Full schedule:")
for a in assigns:
    period_label = f"Period {a.period.index:2} (ID={a.period.id:3})"
    if a.period.is_break:
        content = "BREAK"
    elif a.period.is_lunch:
        content = "LUNCH"
    else:
        content = a.curriculum_row.course_code if a.curriculum_row else a.subject_text or "?"
    print(f"  {period_label}: {content}")

print(f"\n{'='*80}")
print("DIAGNOSIS: What went wrong with the swap?")
print(f"{'='*80}\n")

# Check the latest swap
swap = SpecialTimetableEntry.objects.filter(
    timetable__section=section,
    timetable__name__startswith='[SWAP]',
    is_active=True
).select_related('period', 'curriculum_row').order_by('-id')[:2]

if swap:
    print("Latest swap entries:")
    for e in swap:
        print(f"  Period {e.period.index} (ID={e.period.id}):")
        print(f"    Swapped TO:   {e.curriculum_row.course_code if e.curriculum_row else '?'}")
        print(f"    Originally:   {e.subject_text}")
else:
    print("No active swap entries found")

print(f"\n{'='*80}\n")
