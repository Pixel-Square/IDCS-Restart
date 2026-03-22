from rest_framework import permissions


class PSPermission(permissions.BasePermission):
    """
    Custom permission for PS (Principal Secretary) role.
    """
    
    def has_permission(self, request, view):
        # Must be authenticated
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Superuser always allowed
        if request.user.is_superuser:
            return True
        
        # Check if user has PS role
        if hasattr(request.user, 'user_roles'):
            has_ps_role = request.user.user_roles.filter(role__name='PS').exists()
            if has_ps_role:
                return True
        
        return False


class StaffAttendanceUploadPermission(permissions.BasePermission):
    """
    Permission specifically for staff attendance CSV upload.
    """
    
    def has_permission(self, request, view):
        # Must be authenticated
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Superuser always allowed
        if request.user.is_superuser:
            return True
        
        # Check PS role and upload permission
        if hasattr(request.user, 'user_roles'):
            has_ps_role = request.user.user_roles.filter(role__name='PS').exists()
            has_upload_perm = request.user.has_perm('staff_attendance.upload_csv')
            return has_ps_role and has_upload_perm
        
        return False


class StaffAttendanceViewPermission(permissions.BasePermission):
    """
    Permission for viewing staff attendance records.
    - All authenticated users can view their own records
    - Special permissions needed to view other users' records
    """
    
    def has_permission(self, request, view):
        # Must be authenticated
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Superuser always allowed
        if request.user.is_superuser:
            return True
        
        # All authenticated users can access (object-level filtering will apply)
        return True
    
    def has_object_permission(self, request, view, obj):
        # Superuser can access anything
        if request.user.is_superuser:
            return True
        
        # Users can only access their own attendance records
        if hasattr(obj, 'user') and obj.user == request.user:
            return True
        
        # Users with view permission can access any records
        if request.user.has_perm('staff_attendance.view_attendance_records'):
            return True
        
        return False


class StaffAttendanceConfigPermission(permissions.BasePermission):
    """Permission for attendance configuration management by HR/PS/Admin."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        has_admin_perm = request.user.has_perm('staff_attendance.upload_csv')
        if hasattr(request.user, 'user_roles'):
            role_names = set(
                request.user.user_roles.values_list('role__name', flat=True)
            )
            if role_names.intersection({'HR', 'PS', 'ADMIN'}):
                return True

        return bool(has_admin_perm)