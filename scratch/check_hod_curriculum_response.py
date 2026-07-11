import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from curriculum.views import CurriculumDepartmentViewSet
from rest_framework.test import APIRequestFactory

User = get_user_model()
u = User.objects.filter(username__iexact='RAJKUMAR T').first()
factory = APIRequestFactory()
request = factory.get('/api/curriculum/department/?page_size=0')
request.user = u

view = CurriculumDepartmentViewSet()
view.request = request
view.format_kwarg = None

qs = view.get_queryset()
print(f"Total CurriculumDepartment records returned: {qs.count()}")
dept_counts = {}
for cd in qs:
    dept_code = cd.department.code if cd.department else None
    dept_counts[dept_code] = dept_counts.get(dept_code, 0) + 1

print("Counts by department:")
for code, count in sorted(dept_counts.items()):
    print(f"  {code}: {count}")

print("\nRows matching GEA1105 (Engineering Graphics):")
for cd in qs.filter(course_code='GEA1105'):
    print(f"  ID: {cd.id} | Code: {cd.course_code} | Name: {cd.course_name} | Dept: {cd.department.code} | is_dept_core: {cd.is_dept_core}")
