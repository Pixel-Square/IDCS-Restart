"""
Fix role-based view tab visibility for Students page.

Changes:
1. Remove academics.view_my_students from STAFF role (only ADVISOR should have it)
2. Remove students.view_department_students from iqac role (IQAC uses All Students only)
3. Add academics.view_mentees to HOD/hod roles (HOD can see mentees where applicable)

Run with: python manage.py shell < scripts/fix_students_role_tabs.py
"""
from accounts.models import Permission, Role, RolePermission

def remove_perm_from_role(perm_code, role_name):
    try:
        role = Role.objects.get(name=role_name)
        perm = Permission.objects.get(code=perm_code)
        deleted, _ = RolePermission.objects.filter(role=role, permission=perm).delete()
        if deleted:
            print('REMOVED: ' + role_name + ' -> ' + perm_code)
        else:
            print('not found (ok): ' + role_name + ' -> ' + perm_code)
    except Role.DoesNotExist:
        print('role not found (ok): ' + role_name)
    except Permission.DoesNotExist:
        print('permission not found (ok): ' + perm_code)

def add_perm_to_role(perm_code, role_name, perm_desc=''):
    try:
        role = Role.objects.get(name=role_name)
    except Role.DoesNotExist:
        print('role not found (ok): ' + role_name)
        return
    perm, _ = Permission.objects.get_or_create(code=perm_code, defaults={'description': perm_desc})
    _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
    if created:
        print('ASSIGNED: ' + role_name + ' -> ' + perm_code)
    else:
        print('already set: ' + role_name + ' -> ' + perm_code)

print('=== 1. Remove academics.view_my_students from STAFF ===')
remove_perm_from_role('academics.view_my_students', 'STAFF')

print('\n=== 2. Remove students.view_department_students from iqac ===')
remove_perm_from_role('students.view_department_students', 'iqac')
remove_perm_from_role('students.view_department_students', 'IQAC')  # safety

print('\n=== 3. Add academics.view_mentees to HOD/hod ===')
add_perm_to_role('academics.view_mentees', 'HOD', 'Can view own mentee students')
add_perm_to_role('academics.view_mentees', 'hod', 'Can view own mentee students')

print('\n=== Final state ===')
for code in ['academics.view_my_students', 'academics.view_mentees', 'students.view_department_students', 'students.view_all_students']:
    roles = list(RolePermission.objects.filter(permission__code=code).values_list('role__name', flat=True))
    print(code + ' -> ' + str(roles))

print('\nDone. Users must log out and back in for changes to take effect.')
