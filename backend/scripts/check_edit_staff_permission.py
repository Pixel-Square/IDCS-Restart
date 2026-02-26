"""
Check if current user has permission to edit staff and suggest solutions.
Run: python manage.py shell < scripts/check_edit_staff_permission.py
"""

from accounts.models import User, Role, Permission, RolePermission
from accounts.utils import get_user_permissions

# Get the current user (replace with your username)
username = input("Enter your username: ").strip()

try:
    user = User.objects.get(username=username)
    print(f"\n✓ Found user: {user.username}")
    print(f"  Superuser: {user.is_superuser}")
    
    # Get permissions
    perms = get_user_permissions(user)
    print(f"\n📋 User Permissions:")
    staff_perms = [p for p in perms if 'staff' in p.lower()]
    if staff_perms:
        for p in staff_perms:
            print(f"  ✓ {p}")
    else:
        print("  ⚠️ No staff-related permissions found")
    
    # Check specific permissions
    has_view_staffs_page = 'academics.view_staffs_page' in perms
    has_view_all_staff = 'academics.view_all_staff' in perms
    
    print(f"\n🔍 Required Permissions for Editing Staff:")
    print(f"  view_all_staff: {'✓ YES' if has_view_all_staff else '✗ NO (REQUIRED)'}")
    
    # Get user roles
    roles = user.roles.all()
    print(f"\n👤 User Roles:")
    for role in roles:
        print(f"  • {role.name}")
    
    # Check if we can add permission
    if not has_view_all_staff:
        print(f"\n💡 SOLUTION: Add 'academics.view_all_staff' permission to one of your roles")
        print(f"\nOption 1 - Add to existing role (e.g., HOD):")
        print(f"  from accounts.models import Role, Permission, RolePermission")
        print(f"  role = Role.objects.get(name='HOD')  # or 'IQAC', etc.")
        print(f"  perm = Permission.objects.get(code='academics.view_all_staff')")
        print(f"  RolePermission.objects.get_or_create(role=role, permission=perm)")
        print(f"  # Then logout and login to refresh token")
        
        print(f"\nOption 2 - Use superuser access:")
        print(f"  User.objects.filter(username='{username}').update(is_superuser=True)")
        
        print(f"\n⚠️ After making changes, you MUST logout and login again!")
    else:
        print(f"\n✓ You have the required permission! Try logging out and back in to refresh your token.")

except User.DoesNotExist:
    print(f"✗ User '{username}' not found")
