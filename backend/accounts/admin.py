from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html
from .models import User, Role, UserRole, Permission, RolePermission
from academics.models import StudentProfile, StaffProfile


class StudentProfileInline(admin.StackedInline):
    model = StudentProfile
    can_delete = False
    verbose_name = 'Student profile'
    verbose_name_plural = 'Student profile'


class StaffProfileInline(admin.StackedInline):
    model = StaffProfile
    can_delete = False
    verbose_name = 'Staff profile'
    verbose_name_plural = 'Staff profile'


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    # inherit Django's user add/change forms which correctly handle password hashing
    list_display = ('username', 'email', 'is_staff', 'get_roles')
    inlines = (StudentProfileInline, StaffProfileInline)

    def get_roles(self, obj):
        return ", ".join([r.name for r in obj.roles.all()])
    get_roles.short_description = 'Roles'


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'get_permissions')

    def get_permissions(self, obj):
        return ", ".join([rp.permission.code for rp in obj.role_permissions.all()])
    get_permissions.short_description = 'Permissions'


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('code', 'description')


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'permission')
