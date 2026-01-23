from django.db import models
from django.contrib.auth.models import AbstractUser


class Role(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class RoleMap(models.Model):
    """A separate table mapping role -> key/value permissions or metadata."""
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='maps')
    key = models.CharField(max_length=100)
    value = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ('role', 'key')

    def __str__(self):
        return f"{self.role.name}:{self.key}"


class User(AbstractUser):
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.username
