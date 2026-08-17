import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from academics.models import StaffProfile, DepartmentRole

User = get_user_model()
u = User.objects.filter(username__iexact='RAJKUMAR T').first()
if u:
    print(f"User: {u.username} (ID: {u.id})")
    print(f"Roles from user.roles: {[r.name for r in u.roles.all()]}")
    print(f"Groups: {[g.name for g in u.groups.all()]}")
    print(f"User permissions (get_all_permissions): {u.get_all_permissions()}")
    staff = getattr(u, 'staff_profile', None)
    if staff:
        print(f"Staff Profile ID: {staff.id} | Dept: {staff.department.code if staff.department else None}")
        dept_roles = DepartmentRole.objects.filter(staff=staff)
        for dr in dept_roles:
            print(f"Department Role: {dr.department.code} - {dr.role} (Active: {dr.is_active})")
else:
    print("User RAJKUMAR T not found")
