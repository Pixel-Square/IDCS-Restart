import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Role, DepartmentRole, StaffProfile, Department
from django.contrib.auth import get_user_model

User = get_user_model()

print("=== Roles ===")
for r in Role.objects.all():
    print(f"ID: {r.id} | Name: {r.name}")

print("\n=== Department Roles ===")
for dr in DepartmentRole.objects.all():
    print(f"ID: {dr.id} | Dept: {dr.department.code if dr.department else None} | Role: {dr.role} | Staff User: {dr.staff.user.username if dr.staff and dr.staff.user else None} | Staff Name: {dr.staff.user.get_full_name() if dr.staff and dr.staff.user else None}")

print("\n=== Departments ===")
for d in Department.objects.all():
    print(f"ID: {d.id} | Code: {d.code} | Name: {d.name}")
