from timetable.models import SpecialTimetable, SpecialTimetableEntry
from academics.models import Section

sec = Section.objects.get(pk=1)

# Find all swap special timetables for this section
swaps = SpecialTimetable.objects.filter(name__startswith='[SWAP]', section=sec)

print(f"\nFound {swaps.count()} swap(s) for section {sec}")

for s in swaps:
    entries_count = s.entries.count()
    print(f"\nDeleting: {s.name} (ID={s.id}, Entries={entries_count})")
    s.entries.all().delete()
    s.delete()

print(f"\n✓ All swaps deleted. You can now test with a clean slate.\n")
