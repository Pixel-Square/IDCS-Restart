import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from academics.models import Department, StaffProfile

User = get_user_model()
print("=== HOD Users ===")
for u in User.objects.all():
    roles = [r.name for r in u.roles.all()] if hasattr(u, 'roles') else []
    if any('HOD' in r.upper() for r in roles):
        staff = StaffProfile.objects.filter(user=u).first()
        dept = staff.department if staff else None
        print(f"User: {u.username} | Name: {u.get_full_name()} | ID: {u.id} | Roles: {roles} | Staff Dept: {dept.code if dept else None} ({dept.id if dept else None})")
