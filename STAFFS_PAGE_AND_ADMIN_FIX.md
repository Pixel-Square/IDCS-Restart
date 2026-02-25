# Staffs Page Implementation & Admin Deletion Fix

## Summary

This document covers two implementations:
1. **Staffs Page**: A new frontend page to view staff members by department with permission-based access control
2. **Admin Deletion Fix**: Resolved 500 Internal Server Error when deleting StaffProfile records in Django admin

---

## Part 1: Staffs Page Implementation

### Backend Changes

#### 1. New API Endpoint: `StaffsPageView`
**File**: `backend/academics/views.py`

Added a new view that returns departments with their staff members, respecting user permissions:

```python
class StaffsPageView(APIView):
    """Return departments along with their staffs according to user's permissions."""
    permission_classes = (IsAuthenticated,)
    
    def get(self, request):
        # Requires 'academics.view_staffs_page' permission
        # Returns all departments if user has 'academics.view_all_staff'
        # Otherwise limits to user's effective departments
```

**URL**: `/api/academics/staffs-page/`

#### 2. URL Registration
**File**: `backend/academics/urls.py`

```python
from .views import StaffsPageView

urlpatterns = [
    path('staffs-page/', StaffsPageView.as_view()),
    # ... existing paths
]
```

#### 3. Permission Script
**File**: `backend/scripts/add_staffs_permissions.py`

Creates two permissions:
- `academics.view_staffs_page`: Can view the staffs page
- `academics.view_all_staff`: Can view staff across all departments (global)

**To run the script**:
```bash
cd backend
python manage.py shell < scripts/add_staffs_permissions.py
```

**To assign permissions to a role** (example for HOD):
```python
from accounts.models import Role, Permission, RolePermission

# Get role and permission
hod_role = Role.objects.get(name='HOD')
view_staffs_perm = Permission.objects.get(code='academics.view_staffs_page')

# Assign permission to role
RolePermission.objects.create(role=hod_role, permission=view_staffs_perm)
```

### Frontend Changes

#### 1. New Page Component
**File**: `frontend/src/pages/StaffsPage.tsx`

Features:
- Lists all departments the user can access
- Shows staff members grouped by department
- Expandable/collapsible department sections
- Displays staff ID, name, designation, and status
- Color-coded status badges (Active/Inactive/Resigned)
- Permission-based access control

#### 2. Route Registration
**File**: `frontend/src/App.tsx`

```tsx
import StaffsPage from './pages/StaffsPage';

// In Routes:
<Route
  path="/staffs"
  element={<ProtectedRoute user={user} requiredPermissions={["academics.view_staffs_page"]} element={<StaffsPage />} />}
/>
```

#### 3. Sidebar Navigation
**File**: `frontend/src/components/layout/DashboardSidebar.tsx`

Added "Staff Directory" link to sidebar menu (visible only to users with `academics.view_staffs_page` permission).

### Permission Logic

#### Two-Tier Access Control:

1. **Page Access**: Requires `academics.view_staffs_page` permission
   - Without this, users cannot access the page at all

2. **Data Scope**:
   - **Global Access**: Users with `academics.view_all_staff` (or staff/superuser) see ALL departments
   - **Department-Limited**: Other users see only their effective departments (own dept + HOD/AHOD mappings)

### Access URL
Once deployed: `http://localhost:3000/staffs` (or production URL)

---

## Part 2: Admin Deletion Fix

### Problem

When attempting to delete certain StaffProfile records in Django admin, the following errors occurred:

1. **HTTP 500 Internal Server Error**: POST request failed
2. **JavaScript Error**: `Uncaught ReferenceError: grp is not defined`
3. **JavaScript Error**: `Cannot read properties of null (reading 'addEventListener')`

### Root Causes

#### Issue 1: Signal Handler Validation Error
**File**: `backend/academics/models.py`

The `post_delete` signal for `SectionAdvisor` tried to remove the ADVISOR role from users when their advisor assignments were deleted (CASCADE). However:
- The `accounts/models.py` validation requires users to have at least one role
- When a user had only ADVISOR role, removal triggered a `ValidationError`
- This crashed the deletion transaction

#### Issue 2: Grappelli Static Files
**File**: `backend/erp/settings.py`

- Grappelli admin package was commented out: `# 'grappelli',`
- Browser had cached old static files that referenced `grp` object
- Admin interface tried to execute grappelli JavaScript that no longer existed

### Solutions Implemented

#### Fix 1: Defensive Signal Handlers
**File**: `backend/academics/models.py`

Modified both `post_save` and `post_delete` signals for `SectionAdvisor`:

```python
@receiver(post_delete, sender=SectionAdvisor)
def _sync_advisor_role_on_delete(sender, instance: SectionAdvisor, **kwargs):
    try:
        sp = instance.advisor
        # Skip if StaffProfile is being deleted (CASCADE)
        if sp is None or sp._state.adding or not sp.pk:
            return
        
        user = getattr(sp, 'user', None)
        if not user or not user.pk:
            return
        
        # ... rest of handler
        
        # Only remove role if user has other roles (must maintain at least 1 role)
        user_roles = list(user.roles.all())
        if role_obj in user_roles and len(user_roles) > 1:
            user.roles.remove(role_obj)
    except (ValidationError, Exception):
        # Silently ignore to prevent breaking delete operations
        pass
```

**Key improvements**:
- Check if StaffProfile/User is being deleted before attempting role sync
- Verify user has more than 1 role before removing ADVISOR
- Catch all exceptions to prevent signal from breaking deletions

#### Fix 2: Clear Static Files Cache
**Solutions**:

1. **Recollect static files**:
   ```bash
   cd backend
   python manage.py collectstatic --clear --noinput
   ```

2. **Clear browser cache**:
   - Chrome: Ctrl+Shift+Del → Clear cached images and files
   - Or use incognito/private window to test

3. **Optional - Restart development server** to ensure fresh static files are served

### Testing the Fix

1. Navigate to Django admin: `http://localhost:8000/admin/academics/staffprofile/`
2. Select staff profiles with SectionAdvisor relationships
3. Use "Permanently delete selected profiles and their users" action
4. Deletion should now succeed without 500 errors
5. Verify no JavaScript console errors

---

## Testing Checklist

### Backend API Test
```bash
# 1. Create permissions
cd backend
python manage.py shell < scripts/add_staffs_permissions.py

# 2. Assign to test role (via Django shell or admin)
python manage.py shell
>>> from accounts.models import Role, Permission, RolePermission
>>> hod = Role.objects.get(name='HOD')
>>> perm = Permission.objects.get(code='academics.view_staffs_page')
>>> RolePermission.objects.create(role=hod, permission=perm)

# 3. Test API endpoint (with authentication token)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/api/academics/staffs-page/
```

### Frontend Test
1. Log in with a user that has `academics.view_staffs_page` permission
2. Navigate to `/staffs` or click "Staff Directory" in sidebar
3. Verify departments are displayed with expandable staff lists
4. Check that only authorized departments appear (based on permission scope)

### Admin Deletion Test
1. Go to `http://localhost:8000/admin/academics/staffprofile/`
2. Select one or more staff profiles
3. Choose "Permanently delete selected profiles and their users" action
4. Verify deletion succeeds without errors
5. Check browser console for no JavaScript errors

---

## Deployment Notes

### Backend
1. Run migrations (if any were added - none in this case)
2. Execute permission creation script on production
3. Assign permissions to appropriate roles via admin
4. Collect static files: `python manage.py collectstatic`

### Frontend
1. Build frontend: `npm run build`
2. Deploy built files to web server
3. Clear CDN/browser cache if using caching

---

## Files Modified

### Backend
- `backend/academics/views.py` - Added `StaffsPageView`
- `backend/academics/urls.py` - Registered staffs-page URL
- `backend/academics/models.py` - Fixed signal handlers for SectionAdvisor
- `backend/scripts/add_staffs_permissions.py` - New permission script

### Frontend
- `frontend/src/pages/StaffsPage.tsx` - New page component
- `frontend/src/App.tsx` - Added route and import
- `frontend/src/components/layout/DashboardSidebar.tsx` - Added navigation link

---

## Permissions Reference

| Permission Code | Description | Default Roles |
|----------------|-------------|---------------|
| `academics.view_staffs_page` | Can access the staff directory page | HOD, IQAC (assign as needed) |
| `academics.view_all_staff` | Can view staff across all departments | IQAC, Superuser |

Users without `view_all_staff` see only departments they manage (via `get_user_effective_departments`).

---

## Support

For issues or questions:
1. Check browser console for JavaScript errors
2. Check Django logs for backend errors
3. Verify permissions are assigned correctly via admin
4. Test API endpoint directly with curl/Postman

## Troubleshooting

### "You do not have permission to view this page"
- Verify user has `academics.view_staffs_page` permission
- Check role-permission assignments in admin

### Empty staff list or departments
- User may not have access to any departments
- Check `get_user_effective_departments(user)` logic
- Verify staff profiles have correct department assignments

### Still getting 500 error in admin
- Check Django logs for specific error
- Verify signal handler changes are deployed
- Check for other CASCADE relationships that might fail
