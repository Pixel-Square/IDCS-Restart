import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import TeachingAssignment
from django.db.models import Count

# Find section + curriculum_row combinations with multiple teaching assignments
duplicates = TeachingAssignment.objects.values('section_id', 'curriculum_row_id') \
    .annotate(count=Count('id')) \
    .filter(count__gt=1, curriculum_row_id__isnull=False)

print(f"Found {len(duplicates)} duplicate combinations:")
for dup in duplicates:
    sec_id = dup['section_id']
    cr_id = dup['curriculum_row_id']
    count = dup['count']
    
    tas = TeachingAssignment.objects.filter(section_id=sec_id, curriculum_row_id=cr_id)
    print(f"\nSection {sec_id}, Curriculum Row {cr_id} (Count: {count}):")
    for ta in tas:
        print(f"  TA ID: {ta.id} | Staff: {ta.staff} | Active: {ta.is_active} | Academic Year: {ta.academic_year.name}")
