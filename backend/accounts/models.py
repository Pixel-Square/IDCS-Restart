from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.core.validators import RegexValidator
import re
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password
import secrets


class UsernameValidator(RegexValidator):
    """Custom validator that allows spaces in usernames."""
    regex = r'^[\w\s.@+-]+$'
    message = 'Enter a valid username. This value may contain letters, numbers, spaces, and @/./+/-/_ characters.'
    flags = 0


class User(AbstractUser):
    """
    Base user model.
    All students, staff, HODs, admins are users.
    Their actual capabilities are decided by roles + permissions.
    """
    username = models.CharField(
        max_length=150,
        unique=True,
        help_text='Required. 150 characters or fewer. Letters, numbers, spaces, and @/./+/-/_ characters.',
        validators=[UsernameValidator()],
        error_messages={
            'unique': 'A user with that username already exists.',
        },
    )
    
    roles = models.ManyToManyField(
        'Role',
        through='UserRole',
        related_name='users'
    )

    mobile_no = models.CharField(
        'Mobile no',
        max_length=32,
        blank=True,
        default='',
        help_text='Optional mobile number (leave empty if unknown).',
    )

    def __str__(self):
        return self.username


class MobileOtp(models.Model):
    """OTP for verifying a user's mobile number.

    Stores a *hashed* OTP, not the plain code.
    """

    PURPOSE_CHOICES = (
        ('VERIFY_MOBILE', 'Verify mobile'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='mobile_otps')
    purpose = models.CharField(max_length=32, choices=PURPOSE_CHOICES, default='VERIFY_MOBILE')
    mobile_number = models.CharField(max_length=32)
    otp_hash = models.CharField(max_length=256)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'purpose', 'mobile_number', '-created_at']),
        ]

    def is_expired(self) -> bool:
        try:
            return timezone.now() >= self.expires_at
        except Exception:
            return True

    @staticmethod
    def generate_code(length: int = 6) -> str:
        # 6-digit numeric OTP
        upper = (10 ** length) - 1
        lower = 10 ** (length - 1)
        return str(secrets.randbelow(upper - lower + 1) + lower)

    def set_code(self, plain: str) -> None:
        self.otp_hash = make_password(str(plain))

    def check_code(self, plain: str) -> bool:
        return check_password(str(plain), self.otp_hash)


def _get_profile_type(user):
    # Return 'STUDENT' or 'STAFF' based on attached profile
    if hasattr(user, 'student_profile') and user.student_profile is not None:
        return 'STUDENT'
    if hasattr(user, 'staff_profile') and user.staff_profile is not None:
        return 'STAFF'
    return None


def validate_roles_for_user(user, roles):
    """Validate that the given roles (iterable of Role instances) are compatible with user's profile.

    Raises `ValidationError` on invalid assignment.
    """
    profile = _get_profile_type(user)
    if profile is None:
        raise ValidationError('User must have exactly one profile (student or staff) before assigning roles.')

    # normalize role names
    role_names = {getattr(r, 'name', str(r)).upper() for r in roles}

    STUDENT_ALLOWED = {'STUDENT'}
    STAFF_ALLOWED = {'STAFF', 'FACULTY', 'ADVISOR', 'HOD', 'ADMIN'}

    if profile == 'STUDENT':
        invalid = role_names - STUDENT_ALLOWED
    else:
        invalid = role_names & {'STUDENT'}  # staff must not have STUDENT

    if invalid:
        raise ValidationError(f'Invalid role(s) for profile {profile}: {", ".join(sorted(invalid))}')

class Role(models.Model):
    """
    Logical role (STUDENT, STAFF, HOD, ADMIN, etc.)
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name

class Permission(models.Model):
    """
    Atomic capability used by backend and frontend.
    """
    code = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.code

class RolePermission(models.Model):
    """
    Permissions granted to a role.
    """
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='role_permissions'
    )
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name='permission_roles'
    )

    class Meta:
        unique_together = ('role', 'permission')

    def __str__(self):
        return f"{self.role.name} -> {self.permission.code}"

class UserRole(models.Model):
    """
    Assigns a role to a user.
    A user can have multiple roles (STAFF + ADVISOR).
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_roles'
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='user_roles'
    )

    class Meta:
        unique_together = ('user', 'role')

    def __str__(self):
        return f"{self.user.username} -> {self.role.name}"

    def save(self, *args, **kwargs):
        # Validate role compatibility before saving
        try:
            validate_roles_for_user(self.user, [self.role])
        except ValidationError:
            # re-raise to surface to callers
            raise
        return super().save(*args, **kwargs)


# Keep User.roles assignments safe (covers .roles.add/.remove/.clear usage)
@receiver(m2m_changed, sender=User.roles.through)
def _user_roles_changed(sender, instance, action, reverse, model, pk_set, **kwargs):
    # action can be: pre_add, post_add, pre_remove, post_remove, pre_clear, post_clear
    if action == 'pre_add' and pk_set:
        # validate roles being added
        roles_to_add = model.objects.filter(pk__in=pk_set)
        # final roles = existing + to add
        existing = set(r.name.upper() for r in instance.roles.all())
        to_add = set(r.name.upper() for r in roles_to_add)
        final = existing | to_add
        try:
            validate_roles_for_user(instance, [r for r in model.objects.filter(name__in=[n for n in final])])
        except ValidationError as e:
            raise

    if action in ('pre_remove', 'pre_clear'):
        # ensure user will have at least one role left
        existing_qs = instance.roles.all()
        existing = set(r.pk for r in existing_qs)
        if action == 'pre_clear':
            remaining = set()
        else:
            remaining = existing - set(pk_set or [])

        if not remaining:
            raise ValidationError('User must have at least one role; cannot remove all roles.')


class NotificationTemplate(models.Model):
    """Configurable message templates for OTP/alerts.

    These are managed by IQAC via the Notifications page.
    """

    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    template = models.TextField()
    enabled = models.BooleanField(default=False)
    expiry_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.code


class UserQuery(models.Model):
    """User queries, doubts, errors, and bug reports.
    
    Available to all users without permission requirements.
    """
    
    STATUS_CHOICES = [
        ('SENT', 'Sent'),
        ('VIEWED', 'Viewed'),
        ('REVIEWED', 'Reviewed'),
        ('PENDING', 'Pending'),
        ('IN_PROGRESS', 'In Progress'),
        ('FIXED', 'Fixed'),
        ('LATER', 'Later'),
        ('CLOSED', 'Closed'),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='queries'
    )
    query_text = models.TextField(help_text='Query, doubt, error, or bug description')
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='SENT'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    admin_notes = models.TextField(blank=True, default='', help_text='Response or notes from admin (visible to user)')
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'User Query'
        verbose_name_plural = 'User Queries'
    
    def __str__(self):
        return f"{self.user.username} - {self.status} - {self.created_at.strftime('%Y-%m-%d')}"
