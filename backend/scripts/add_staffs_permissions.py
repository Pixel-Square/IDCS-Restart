"""
Create permissions required for the staffs page.

Run with: python manage.py shell < scripts/add_staffs_permissions.py

Permission Logic:
- academics.view_staffs_page: Required to access the staff directory page
- academics.view_all_staff: Optional - allows viewing staff from ALL departments
  
Without view_all_staff permission, users see only their own department's staff.
"""
from accounts.models import Permission

perms = [
    ('academics.view_staffs_page', 'Can view the staffs page - required for page access'),
    ('academics.view_all_staff', 'Can view staff across all departments - optional for global access')
]

for code, desc in perms:
    p, created = Permission.objects.get_or_create(code=code, defaults={'description': desc})
    if created:
        print(f'✓ Created permission: {p.code}')
    else:
        print(f'✓ Permission already exists: {p.code}')

print('\n' + '='*70)
print('RECOMMENDED PERMISSION ASSIGNMENTS:')
print('='*70)
print('\n1. For HODs (view own department only):')
print('   - Assign: academics.view_staffs_page')
print('   - Do NOT assign: academics.view_all_staff')
print('\n2. For IQAC/Admin (view all departments):')
print('   - Assign: academics.view_staffs_page')
print('   - Assign: academics.view_all_staff')
print('\n' + '='*70)
print('\nTo assign permission via Django shell:')
print('  from accounts.models import Role, Permission, RolePermission')
print('  role = Role.objects.get(name="HOD")')
print('  perm = Permission.objects.get(code="academics.view_staffs_page")')
print('  RolePermission.objects.get_or_create(role=role, permission=perm)')
print('\nOr use Django Admin: Accounts > Role Permissions')
print('='*70)
