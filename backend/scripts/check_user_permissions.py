"""
Check a specific user's permissions for the staffs page.

Run with: python manage.py shell
Then paste this code and enter the username when prompted.
"""
from accounts.models import User
from accounts.utils import get_user_permissions

# Get username from input
username = input("Enter username to check: ").strip()

try:
    user = User.objects.get(username=username)
    perms = get_user_permissions(user)
    
    print("\n" + "="*70)
    print(f"USER: {user.username}")
    print("="*70)
    print(f"\nIs Superuser: {user.is_superuser}")
    print(f"Is Staff (Django Admin): {user.is_staff}")
    
    print(f"\nProfile Type: {getattr(user, 'profile_type', 'Unknown')}")
    
    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile:
        print(f"Staff ID: {staff_profile.staff_id}")
        dept = staff_profile.current_department
        if dept:
            print(f"Current Department: {dept.code} - {dept.name}")
        else:
            print("Current Department: None")
    
    print(f"\nAll Permissions ({len(perms)}):")
    print("-" * 70)
    
    staffs_related = [p for p in sorted(perms) if 'staff' in p.lower()]
    if staffs_related:
        print("\nStaffs-related permissions:")
        for p in staffs_related:
            print(f"  ✓ {p}")
    
    print("\n" + "="*70)
    print("KEY PERMISSIONS FOR STAFFS PAGE:")
    print("="*70)
    print(f"  academics.view_staffs_page: {'✓ YES' if 'academics.view_staffs_page' in perms else '✗ NO'}")
    print(f"  academics.view_all_staff:   {'✓ YES' if 'academics.view_all_staff' in perms else '✗ NO'}")
    print("\n" + "="*70)
    
    if 'academics.view_staffs_page' not in perms:
        print("❌ User CANNOT access staffs page (missing view_staffs_page)")
    elif 'academics.view_all_staff' in perms or user.is_superuser:
        print("📂 User will see ALL DEPARTMENTS")
    else:
        print("📁 User will see ONLY their own department")
    print("="*70)
    
except User.DoesNotExist:
    print(f"❌ User '{username}' not found")
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
