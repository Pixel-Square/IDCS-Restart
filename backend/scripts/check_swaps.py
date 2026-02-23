from timetable.models import SpecialTimetable, SpecialTimetableEntry
from academics.models import Section

section = Section.objects.get(pk=1)
print(f"\n{'='*80}")
print(f"CHECKING ALL SWAPS FOR: {section}")
print(f"{'='*80}\n")

swaps = SpecialTimetable.objects.filter(
    name__startswith='[SWAP]', 
    section=section
).order_by('-id')

print(f"Found {swaps.count()} swap(s):\n")

for s in swaps:
    print(f"\n{s.name} (ID={s.id}, Active={s.is_active}):")
    entries = SpecialTimetableEntry.objects.filter(timetable=s).order_by('period__index')
    if not entries:
        print("  (No entries)")
    else:
        for e in entries:
            new_subj = e.curriculum_row.course_code if e.curriculum_row else "?"
            orig_subj = e.subject_text or "—"
            staff = e.staff if e.staff else "None"
            print(f"  Period {e.period.index} (ID={e.period.id}): Date={e.date}, Active={e.is_active}")
            print(f"    Staff: {staff}")
            print(f"    New Subject:  {new_subj}")
            print(f"    Orig Subject: {orig_subj}")

print(f"\n{'='*80}\n")
