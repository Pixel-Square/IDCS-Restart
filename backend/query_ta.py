import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from academics.models import TeachingAssignment

# Search for teaching assignments related to 'devahi' or 'tamils'
tas = TeachingAssignment.objects.filter(staff__name__icontains='devahi')
print("Teaching Assignments for devahi:")
for ta in tas:
    print(f"ID: {ta.id}, Subject: {ta.subject.name if ta.subject else 'None'}, Section: {ta.section.name if ta.section else 'None'}")
