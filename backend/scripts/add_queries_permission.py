"""
Add queries.manage permission for query management.

Run with: python manage.py shell < scripts/add_queries_permission.py
"""
from accounts.models import Permission

# Create or get queries.manage permission
perm, created = Permission.objects.get_or_create(
    code='queries.manage',
    defaults={
        'description': 'Can manage all user queries and support tickets'
    }
)

if created:
    print(f'✓ Created permission: {perm.code}')
else:
    print(f'✓ Permission already exists: {perm.code}')

print('\nTo assign this permission to a role, use the admin panel or:')
print('  RolePermission.objects.create(role=<role_obj>, permission=perm)')
