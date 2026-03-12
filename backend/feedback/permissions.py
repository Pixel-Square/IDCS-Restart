"""
Feedback module permissions.

This module defines custom permission classes for the feedback app.
All permissions use the existing accounts app permission system (roles, permissions, role_permissions).
"""

from rest_framework import permissions
from accounts.utils import get_user_permissions


class HasFeedbackPagePermission(permissions.BasePermission):
    """
    Check if user has permission to view the feedback page.
    
    Required permission: feedback.feedback_page
    """
    
    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        
        # Superusers always have access
        if getattr(user, 'is_superuser', False):
            return True
        
        # Check if user has the feedback page permission
        try:
            perms = get_user_permissions(user)
            return 'feedback.feedback_page' in perms
        except Exception:
            return False


class HasFeedbackCreatePermission(permissions.BasePermission):
    """
    Check if user has permission to create feedback forms.
    
    Required permission: feedback.create
    Typically assigned to: HOD role
    """
    
    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        
        # Superusers always have access
        if getattr(user, 'is_superuser', False):
            return True
        
        # Check if user has the feedback create permission
        try:
            perms = get_user_permissions(user)
            return 'feedback.create' in perms
        except Exception:
            return False


class HasFeedbackReplyPermission(permissions.BasePermission):
    """
    Check if user has permission to submit feedback responses.
    
    Required permission: feedback.reply
    Typically assigned to: STAFF and STUDENT roles
    """
    
    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        
        # Superusers always have access
        if getattr(user, 'is_superuser', False):
            return True
        
        # Check if user has the feedback reply permission
        try:
            perms = get_user_permissions(user)
            return 'feedback.reply' in perms
        except Exception:
            return False
