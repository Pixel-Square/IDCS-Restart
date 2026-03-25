from django.contrib.auth import get_user_model
from accounts.utils import get_user_permissions
from accounts.services_dashboard import resolve_dashboard_capabilities
from accounts.models import Role

User = get_user_model()
lookup = '3171001'
user = User.objects.filter(username=lookup).first() or User.objects.filter(email=lookup).first() or User.objects.filter(id=lookup).first()
if not user:
    # Try staff_profile.staff_id fallback
    user = User.objects.filter(staff_profile__staff_id=lookup).first()
if not user:
    print('USER_NOT_FOUND')
else:
    print('USER:', user.id, user.username)
    print('EXPLICIT_ROLES:', [r.name for r in user.roles.all()])
    # DepartmentRole names
    try:
        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile is not None:
            from academics.models import DepartmentRole
            dept_roles = list(DepartmentRole.objects.filter(staff=staff_profile, is_active=True).values_list('role', flat=True))
        else:
            dept_roles = []
    except Exception as e:
        dept_roles = ['ERR:' + str(e)]
    print('DEPARTMENT_ROLES:', dept_roles)

    perms = get_user_permissions(user)
    print('PERMISSIONS:', sorted(perms))

    caps = resolve_dashboard_capabilities(user)
    print('ENTRY_POINTS.hod_obe_requests:', caps.get('entry_points', {}).get('hod_obe_requests'))
    print('ENTRY_POINTS:', caps.get('entry_points'))

    hod_role = Role.objects.filter(name__iexact='HOD').first()
    if hod_role:
        print('HOD_ROLE_PRESENT:', True)
        print('HOD_ROLE_PERMISSIONS:', [rp.permission.code for rp in hod_role.role_permissions.all()])
    else:
        print('HOD_ROLE_PRESENT:', False)
