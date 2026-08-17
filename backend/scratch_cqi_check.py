import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from academic_v2.models import AcV2Section

# Find sections for AGB1221
sections = AcV2Section.objects.filter(teaching_assignment__subject__code='AGB1221')
print(f"=== AcV2Section for AGB1221 (count: {sections.count()}) ===")
for s in sections:
    ta = s.teaching_assignment
    print(f"  Section ID: {s.id}, TA: {ta.id}, Subject: {ta.subject.code} - {ta.subject.name}")

# Also check AcV2Section model fields
print("\n=== AcV2Section fields ===")
for f in AcV2Section._meta.get_fields():
    print(f"  {f.name}: {type(f).__name__}")
