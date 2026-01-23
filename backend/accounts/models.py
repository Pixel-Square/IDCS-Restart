from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings


class User(AbstractUser):
    """
    Base user model.
    All students, staff, HODs, admins are users.
    Their actual capabilities are decided by roles + permissions.
    """
    roles = models.ManyToManyField(
        'Role',
        through='UserRole',
        related_name='users'
    )

    def __str__(self):
        return self.username

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
