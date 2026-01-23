from django.contrib import admin
from .models import User, Role, RoleMap


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'is_staff')


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name',)


@admin.register(RoleMap)
class RoleMapAdmin(admin.ModelAdmin):
    list_display = ('role', 'key', 'value')
