"""
Superuser Impersonation - Models for audit logging and access control.
"""
from django.db import models
from django.conf import settings
from django.utils import timezone
import json


class SuperuserImpersonationLog(models.Model):
    """
    Audit log for superuser impersonation events.
    
    Tracks when a superuser logs into another user's account,
    for security and compliance purposes.
    """
    
    STATUS_CHOICES = [
        ('SUCCESS', 'Successful'),
        ('FAILED', 'Failed - Invalid User'),
        ('DENIED', 'Denied - Insufficient Permissions'),
        ('DISABLED', 'Denied - Target User Inactive'),
    ]
    
    # The superuser performing the impersonation
    superuser = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='impersonations_performed'
    )
    
    # The target user being impersonated
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='impersonations_received',
        null=True,
        blank=True
    )
    
    # Attempt status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='SUCCESS'
    )
    
    # IP address of the request
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    
    # User agent (browser info)
    user_agent = models.CharField(max_length=500, blank=True)
    
    # Reason/purpose for impersonation
    reason = models.TextField(blank=True, default='')
    
    # Additional metadata
    metadata = models.JSONField(default=dict, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    accessed_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this impersonation session should expire'
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['superuser', '-created_at']),
            models.Index(fields=['target_user', '-created_at']),
            models.Index(fields=['status', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.superuser.username} → {self.target_user.username if self.target_user else 'Unknown'} ({self.status})"
    
    @classmethod
    def log_impersonation(cls, superuser, target_user, status, ip_address='', user_agent='', reason='', metadata=None):
        """Helper to create an impersonation log entry."""
        return cls.objects.create(
            superuser=superuser,
            target_user=target_user,
            status=status,
            ip_address=ip_address,
            user_agent=user_agent,
            reason=reason,
            metadata=metadata or {}
        )


class SuperuserImpersonationPermission(models.Model):
    """
    Configurable permissions for superuser impersonation.
    
    Allows fine-grained control over which superusers can impersonate
    which users based on roles, departments, etc.
    """
    
    # The superuser granted permission to impersonate
    superuser = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='impersonation_permissions'
    )
    
    # Can impersonate ANY user (only grant to trusted admins)
    can_impersonate_any = models.BooleanField(default=False)
    
    # Can only impersonate users in specific roles
    allowed_target_roles = models.ManyToManyField(
        'Role',
        blank=True,
        help_text='Leave empty to allow all roles'
    )
    
    # Can only impersonate users in specific departments
    # (requires academics app)
    allowed_departments = models.CharField(
        max_length=500,
        blank=True,
        default='',
        help_text='Comma-separated department codes, or empty for all'
    )
    
    # Expiry date for this permission
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Leave empty for no expiry'
    )
    
    # Is this permission active?
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('superuser',)
        verbose_name = 'Superuser Impersonation Permission'
        verbose_name_plural = 'Superuser Impersonation Permissions'
    
    def __str__(self):
        return f"Impersonation permissions for {self.superuser.username}"
    
    def is_expired(self):
        """Check if this permission has expired."""
        if not self.expires_at:
            return False
        return timezone.now() > self.expires_at
    
    def can_impersonate(self, target_user):
        """
        Check if this superuser can impersonate the given target user.
        
        Returns: (bool, str) - (can_impersonate, reason_if_no)
        """
        if not self.is_active:
            return False, "Impersonation permission is inactive"
        
        if self.is_expired():
            return False, "Impersonation permission has expired"
        
        if self.can_impersonate_any:
            return True, ""
        
        # Check target roles
        if self.allowed_target_roles.exists():
            target_role_names = set(target_user.roles.values_list('name', flat=True))
            allowed_role_names = set(self.allowed_target_roles.values_list('name', flat=True))
            if not target_role_names & allowed_role_names:
                return False, f"Target user's roles not in allowed list"
        
        # Check departments
        if self.allowed_departments.strip():
            allowed_depts = set(d.strip().upper() for d in self.allowed_departments.split(',') if d.strip())
            try:
                staff_profile = getattr(target_user, 'staff_profile', None)
                if staff_profile:
                    dept = getattr(staff_profile, 'department', None)
                    if dept:
                        dept_code = getattr(dept, 'code', '').upper()
                        if dept_code not in allowed_depts:
                            return False, f"Target user's department not in allowed list"
            except Exception:
                pass
        
        return True, ""
