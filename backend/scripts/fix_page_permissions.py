"""
Fix missing page permissions for Students and Staff Directory pages.
Run with: python manage.py shell < scripts/fix_page_permissions.py
"""
from accounts.models import Permission, Role, RolePermission

all_roles = {r.name: r for r in Role.objects.all()}
print('All roles in DB:', list(all_roles.keys()))

# Permission -> role names that should have them
ROLE_MAP = {
    'students.view_students': ['IQAC', 'iqac', 'HOD', 'AHOD', 'ADVISOR', 'STAFF', 'HAA', 'AP', 'hod', 'ahod'],
    'students.view_all_students': ['IQAC', 'iqac', 'HAA', 'AP'],
    'students.view_department_students': ['IQAC', 'iqac', 'HOD', 'AHOD', 'ADVISOR', 'HAA', 'AP', 'hod', 'ahod'],
    'academics.view_my_students': ['ADVISOR', 'STAFF'],
    'academics.view_mentees': ['ADVISOR', 'STAFF'],
    'academics.view_staffs_page': ['IQAC', 'iqac', 'HOD', 'AHOD', 'HAA', 'AP', 'hod', 'ahod'],
    'academics.view_all_staff': ['IQAC', 'iqac', 'HAA', 'AP'],
}

# Ensure all permissions exist
PERMISSIONS = [
    ('students.view_students', 'Can access the Students page'),
    ('students.view_all_students', 'Can view students from all departments'),
    ('students.view_department_students', 'Can view students in own department'),
    ('academics.view_my_students', 'Can view own advised students'),
    ('academics.view_mentees', 'Can view own mentee students'),
    ('academics.view_staffs_page', 'Can access the Staff Directory page'),
    ('academics.view_all_staff', 'Can view staff from all departments'),
]

print('\n--- Ensuring permissions exist ---')
for code, desc in PERMISSIONS:
    obj, created = Permission.objects.get_or_create(code=code, defaults={'description': desc})
    print(('CREATED' if created else 'exists') + ': ' + code)

print('\n--- Assigning permissions to roles ---')
for code, role_names in ROLE_MAP.items():
    perm = Permission.objects.filter(code=code).first()
    if not perm:
        print('MISSING PERMISSION: ' + code)
        continue
    for rname in role_names:
        role = all_roles.get(rname)
        if not role:
            continue
        _, created = RolePermission.objects.get_or_create(role=role, permission=perm)
        print(('ASSIGNED' if created else 'already set') + ': ' + rname + ' -> ' + code)

print('\n--- Final verification ---')
print('Roles with students.view_students:')
for rp in RolePermission.objects.filter(permission__code='students.view_students').select_related('role'):
    print('  ' + rp.role.name)
print('Roles with academics.view_staffs_page:')
for rp in RolePermission.objects.filter(permission__code='academics.view_staffs_page').select_related('role'):
    print('  ' + rp.role.name)

print('\nDone.')
