import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumDepartment, ElectiveSubject

parent_ids = [494, 497, 499, 496, 495, 498]
print("=== ElectiveSubject for parent rows ===")
es_list = ElectiveSubject.objects.filter(parent_id__in=parent_ids)
print(f"Total: {es_list.count()}")
for es in es_list:
    print(f"ID: {es.id} | Parent: {es.parent_id} ({es.parent.course_name}) | Dept: {es.department.code} | Code: {es.course_code} | Name: {es.course_name}")
