import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academic_v2.models import AcV2Section
from academics.models import TeachingAssignment

total_acv2 = AcV2Section.objects.count()
print(f"Total AcV2Section records: {total_acv2}")

for asec in AcV2Section.objects.all()[:15]:
    ta = asec.teaching_assignment
    print(f"AcV2Section ID: {asec.id} | Section Name: {asec.section_name} | Course: {asec.course.subject_name} | Faculty: {asec.faculty_user} | TA ID: {ta.id if ta else None} | TA Staff: {ta.staff if ta else None}")
