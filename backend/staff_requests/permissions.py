from rest_framework import permissions


class IsAdminOrHR(permissions.BasePermission):
    """
    Custom permission to only allow admin or HR users to access the view.
    
    Customize this based on your user model and role system.
    """
    
    def has_permission(self, request, view):
        # Allow superusers
        if request.user.is_superuser:
            return True
        
        # Allow staff users (Django admin access)
        if request.user.is_staff:
            return True
        
        # PLACEHOLDER: Add your HR role check
        # Example implementations:
        
        # Option 1: Group-based
        if hasattr(request.user, 'groups'):
            if request.user.groups.filter(name__in=['HR', 'Admin']).exists():
                return True
        
        # Option 2: Profile-based
        if hasattr(request.user, 'profile'):
            if hasattr(request.user.profile, 'role'):
                if request.user.profile.role in ['HR', 'ADMIN']:
                    return True
            if hasattr(request.user.profile, 'is_hr') and request.user.profile.is_hr:
                return True
        
        return False


class IsRequestApplicantOrApprover(permissions.BasePermission):
    """
    Permission to allow:
    - Applicant to view their own request
    - Approvers to view requests they need to approve
    - Admin/HR to view all requests
    """
    
    def has_object_permission(self, request, view, obj):
        # Admin/HR can view all
        if request.user.is_superuser or request.user.is_staff:
            return True
        
        # Applicant can view their own request
        if obj.applicant == request.user:
            return True
        
        # Check if user is an approver for this request
        from .views import is_user_approver_for_request
        required_role = obj.get_required_approver_role()
        if required_role and is_user_approver_for_request(request.user, obj, required_role):
            return True
        
        # PLACEHOLDER: Add department-based access
        # e.g., HOD can view all requests from their department
        
        return False


class CanProcessApproval(permissions.BasePermission):
    """
    Permission to check if user can approve/reject a specific request.
    Used in the process_approval action.
    """
    
    def has_object_permission(self, request, view, obj):
        # Only for pending requests
        if obj.status != 'pending':
            return False
        
        # Check if user has the required approver role
        from .views import is_user_approver_for_request
        required_role = obj.get_required_approver_role()
        
        if not required_role:
            return False
        
        return is_user_approver_for_request(request.user, obj, required_role)
