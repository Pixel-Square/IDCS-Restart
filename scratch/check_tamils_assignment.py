import sys
import os

# Add backend directory to sys.path so we can import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
import django
django.setup()

from rest_framework.test import APIClient
from academics.models import DepartmentRole
from curriculum.models import CurriculumDepartment

r1 = CurriculumDepartment.objects.filter(id=532).first()
if r1: print(f"Row 532: {r1.course_code} - Dept {r1.department.code if r1.department else None}")
r2 = CurriculumDepartment.objects.filter(id=1321).first()
if r2: print(f"Row 1321: {r2.course_code} - Dept {r2.department.code if r2.department else None}")

hod_role = DepartmentRole.objects.filter(role__iexact='HOD', department__code='S&H').first()
if hod_role:
    u = hod_role.staff.user
    client = APIClient()
    client.force_authenticate(user=u)
    res = client.get('/api/academics/teaching-assignments/?page_size=0')
    data = res.json()
    items = data.get('results', data) if isinstance(data, dict) else data
    print(f"HOD {u.username} sees {len(items)} assignments")
    c_1321 = [a for a in items if a.get('curriculum_row_details') and a['curriculum_row_details'].get('id') == 1321]
    print(f"HOD sees {len(c_1321)} assignments for 1321")
else:
    print("No S&H HOD found")
