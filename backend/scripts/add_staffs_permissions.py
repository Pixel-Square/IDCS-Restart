"""
Create permissions required for the staffs page.

Run with: python manage.py shell < scripts/add_staffs_permissions.py
"""
from accounts.models import Permission

perms = [
    ('academics.view_staffs_page', 'Can view the staffs page listing departments and staffs'),
    ('academics.view_all_staff', 'Can view staff across all departments (global)')
]

for code, desc in perms:
    p, created = Permission.objects.get_or_create(code=code, defaults={'description': desc})
    if created:
        print(f'Created permission: {p.code}')
    else:
        print(f'Permission already exists: {p.code}')

print('\nTo assign permission to a role:')
print("  from accounts.models import Role, RolePermission; r = Role.objects.get(name='HOD'); p = Permission.objects.get(code='academics.view_staffs_page'); RolePermission.objects.create(role=r, permission=p)")
