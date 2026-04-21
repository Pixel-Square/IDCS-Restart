# Academic Calendar Admin - Backend Setup Instructions

## Overview
This document explains how to set up the Academic Calendar Admin permission in the Django backend database.

## What Was Changed

### 1. Backend Permission System (`/backend/accounts/`)

#### File: `services_dashboard.py`
Added support for the `academic_calendar.admin` permission:

```python
# New flag added:
'can_manage_academic_calendar': 'academic_calendar.admin' in lower_perms,

# New entry point added:
'academic_calendar_admin': bool(flags.get('can_manage_academic_calendar')),
```

This enables the backend to recognize and authorize users with this permission.

### 2. Frontend Sidebar (`/frontend/src/components/layout/DashboardSidebar.tsx`)
Updated to check for the `academic_calendar_admin` entry point instead of just the IQAC role:

```typescript
// Now checks for entry point permission
if (entry.academic_calendar_admin && !items.some((item) => item.key === 'academic_calendar_admin')) {
  items.push({ key: 'academic_calendar_admin', label: 'Calendar Admin', to: '/iqac/calendar/admin' });
}
```

### 3. Database Migration (`/backend/accounts/migrations/0030_add_academic_calendar_admin_permission.py`)
Created a migration that:
- Creates the `academic_calendar.admin` permission
- Assigns it to the IQAC role automatically

## Setup Instructions

### Option 1: Run Migration (Recommended)

1. **Navigate to backend directory:**
   ```bash
   cd /home/iqac/IDCS-Restart/backend
   ```

2. **Run the migration:**
   ```bash
   python manage.py migrate accounts
   ```

3. **Verify the permission was created:**
   ```bash
   python manage.py shell
   ```
   ```python
   from accounts.models import Permission, Role, RolePermission
   
   # Check if permission exists
   perm = Permission.objects.get(code='academic_calendar.admin')
   print(f"Permission: {perm.code} - {perm.description}")
   
   # Check if IQAC has the permission
   iqac_role = Role.objects.get(name='IQAC')
   has_perm = RolePermission.objects.filter(role=iqac_role, permission=perm).exists()
   print(f"IQAC has permission: {has_perm}")
   ```

### Option 2: Manual Setup via Django Admin

If you prefer to use Django Admin interface:

1. **Access Django Admin:**
   - Navigate to: `http://your-domain/admin/`
   - Login with superuser credentials

2. **Create the Permission:**
   - Go to: `Accounts > Permissions`
   - Click "Add Permission"
   - Fill in:
     - **Code**: `academic_calendar.admin`
     - **Description**: `Can access and manage Academic Calendar Admin page - upload/view/delete academic calendars`
   - Click "Save"

3. **Assign to IQAC Role:**
   - Go to: `Accounts > Role Permissions`
   - Click "Add Role Permission"
   - Select:
     - **Role**: IQAC
     - **Permission**: academic_calendar.admin
   - Click "Save"

### Option 3: Using Django Shell

```bash
cd /home/iqac/IDCS-Restart/backend
python manage.py shell
```

```python
from accounts.models import Permission, Role, RolePermission

# Create permission
permission, created = Permission.objects.get_or_create(
    code='academic_calendar.admin',
    defaults={
        'description': 'Can access and manage Academic Calendar Admin page - upload/view/delete academic calendars'
    }
)

if created:
    print("✓ Permission created")
else:
    print("✓ Permission already exists")

# Get IQAC role
iqac_role, _ = Role.objects.get_or_create(
    name='IQAC',
    defaults={'description': 'Internal Quality Assurance Cell'}
)

# Assign permission to role
role_perm, created = RolePermission.objects.get_or_create(
    role=iqac_role,
    permission=permission
)

if created:
    print("✓ Permission assigned to IQAC role")
else:
    print("✓ Permission already assigned to IQAC role")

print("\n✓ Setup complete!")
```

## Verification

### Check User Access

To verify a specific IQAC user has access:

```python
from django.contrib.auth import get_user_model
from accounts.services_dashboard import resolve_dashboard_capabilities

User = get_user_model()

# Replace with actual IQAC user email
user = User.objects.get(email='iqac@krct.ac.in')

# Get dashboard capabilities
caps = resolve_dashboard_capabilities(user)

# Check flags
print(f"Can manage calendar: {caps['flags']['can_manage_academic_calendar']}")

# Check entry points
print(f"Calendar admin entry: {caps['entry_points']['academic_calendar_admin']}")

# Check permissions list
print(f"Has permission: {'academic_calendar.admin' in caps['permissions']}")
```

### Test Frontend Access

1. Login as an IQAC user
2. Check the sidebar - "Calendar Admin" link should appear
3. Navigate to `/iqac/calendar/admin`
4. You should see the Academic Calendar Admin page

## Assigning to Other Roles (Optional)

If you want to give access to other roles (e.g., ADMIN, PRINCIPAL):

### Via Django Shell:
```python
from accounts.models import Permission, Role, RolePermission

permission = Permission.objects.get(code='academic_calendar.admin')

# Assign to ADMIN role
admin_role = Role.objects.get(name='ADMIN')
RolePermission.objects.get_or_create(role=admin_role, permission=permission)

# Assign to PRINCIPAL role
principal_role = Role.objects.get(name='PRINCIPAL')
RolePermission.objects.get_or_create(role=principal_role, permission=permission)
```

### Via Django Admin:
1. Go to `Accounts > Role Permissions`
2. Add new entries for each role

## Permission Details

**Permission Code**: `academic_calendar.admin`

**Description**: Can access and manage Academic Calendar Admin page - upload/view/delete academic calendars

**Grants Access To**:
- `/iqac/calendar/admin` route
- Calendar Admin sidebar link
- Excel upload functionality
- Calendar viewing and deletion

**Default Assignment**: IQAC role

## Troubleshooting

### "Calendar Admin" not showing in sidebar

**Check:**
1. User has IQAC role assigned:
   ```python
   user.roles.filter(name='IQAC').exists()
   ```

2. Permission exists and is assigned:
   ```python
   from accounts.models import RolePermission
   RolePermission.objects.filter(
       role__name='IQAC',
       permission__code='academic_calendar.admin'
   ).exists()
   ```

3. Clear browser cache and refresh

### Permission not working after migration

**Solution:**
1. Restart Django development server
2. Clear any caching (Redis, memcached)
3. Re-login the user

### Migration conflicts

If migration conflicts occur:

```bash
python manage.py migrate accounts --fake 0030
python manage.py migrate accounts
```

Or manually run the migration code in Django shell as shown in Option 3.

## Files Modified

### Backend:
- `/backend/accounts/services_dashboard.py` - Added permission check
- `/backend/accounts/migrations/0030_add_academic_calendar_admin_permission.py` - Migration file

### Frontend:
- `/frontend/src/components/layout/DashboardSidebar.tsx` - Updated to check entry point
- `/frontend/src/pages/academicCalendar/AcademicCalendarAdmin.tsx` - Admin page component
- `/frontend/src/App.tsx` - Route definition

## Next Steps

After setting up the permission:

1. Run the migration: `python manage.py migrate accounts`
2. Restart Django server
3. Login as IQAC user
4. Verify "Calendar Admin" appears in sidebar
5. Test the Academic Calendar Admin functionality

## Support

If you encounter issues:
1. Check Django logs for permission errors
2. Verify user has IQAC role in Django admin
3. Check browser console for frontend errors
4. Ensure backend migration was applied successfully
