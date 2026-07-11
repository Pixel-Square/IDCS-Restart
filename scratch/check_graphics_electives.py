import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import ElectiveSubject

electives = ElectiveSubject.objects.filter(course_code='GEA1105')
if not electives.exists():
    electives = ElectiveSubject.objects.filter(course_name__icontains='graphics')

print(f"Total ElectiveSubject rows: {electives.count()}")
for e in electives:
    print(f"ID: {e.id} | Parent ID: {e.parent_id} | Code: {e.course_code} | Name: {e.course_name} | Dept: {e.department.code} | Semester: {e.semester.number}")
