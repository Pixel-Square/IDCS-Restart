from academics.models import Section, Batch

print("\n=== Sections in 2023 Batch with Department Info ===\n")
sections = Section.objects.select_related('batch', 'batch__department').filter(batch__name='2023')[:20]
for s in sections:
    dept_name = s.batch.department.name if s.batch and s.batch.department else "No Dept"
    print(f"ID {s.id:3}: Section {s.name:5} | Batch: {s.batch.name:10} | Dept: {dept_name}")

print("\n=== Looking for AI&DS or similar ===\n")
for s in sections:
    if s.batch and s.batch.department:
        dept = s.batch.department.name
        if 'AI' in dept or 'Data' in dept or 'Intelligence' in dept:
            print(f"✓ Found: ID {s.id}, Section {s.name}, Dept: {dept}")
