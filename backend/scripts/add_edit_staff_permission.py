"""
Add the academics.edit_staff permission.
This allows users to create/edit/delete staff within their scope.

Run: python manage.py shell < scripts/add_edit_staff_permission.py
"""

from accounts.models import Permission, Role, RolePermission

# Create the edit_staff permission
perm, created = Permission.objects.get_or_create(
    code='academics.edit_staff',
    defaults={
        'description': 'Can create, edit, and delete staff profiles within their scope (HODs: own department, IQAC/Superusers: all departments)'
    }
)

if created:
    print(f"✓ Created permission: {perm.code}")
else:
    print(f"ℹ Permission already exists: {perm.code}")

# Optionally add to HOD role by default
try:
    hod_role = Role.objects.get(name='HOD')
    rp, created = RolePermission.objects.get_or_create(role=hod_role, permission=perm)
    if created:
        print(f"✓ Added {perm.code} to HOD role")
    else:
        print(f"ℹ HOD role already has {perm.code}")
except Role.DoesNotExist:
    print("⚠ HOD role not found - skipping assignment")

# Optionally add to IQAC role
try:
    iqac_role = Role.objects.get(name='IQAC')
    rp, created = RolePermission.objects.get_or_create(role=iqac_role, permission=perm)
    if created:
        print(f"✓ Added {perm.code} to IQAC role")
    else:
        print(f"ℹ IQAC role already has {perm.code}")
except Role.DoesNotExist:
    print("⚠ IQAC role not found - skipping assignment")

print("\n✓ Done! Users with this permission can now edit staff within their scope.")
print("⚠ Users need to LOGOUT and LOGIN again to refresh their JWT token!")
