from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html
from .models import User, Role, UserRole, Permission, RolePermission
from academics.models import StudentProfile, StaffProfile
from django import forms
from django.core.exceptions import ValidationError
from .models import validate_roles_for_user


class StudentProfileInline(admin.StackedInline):
    model = StudentProfile
    can_delete = False
    verbose_name = 'Student profile'
    verbose_name_plural = 'Student profile'
    readonly_fields = ('reg_no',)

    def get_readonly_fields(self, request, obj=None):
        # make reg_no readonly when editing an existing user's student profile
        if obj and getattr(obj, 'student_profile', None) is not None:
            return ('reg_no',)
        return ()


class StaffProfileInline(admin.StackedInline):
    model = StaffProfile
    can_delete = False
    verbose_name = 'Staff profile'
    verbose_name_plural = 'Staff profile'
    readonly_fields = ('staff_id',)

    def get_readonly_fields(self, request, obj=None):
        # make staff_id readonly when editing an existing user's staff profile
        if obj and getattr(obj, 'staff_profile', None) is not None:
            return ('staff_id',)
        return ()


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    # inherit Django's user add/change forms which correctly handle password hashing
    list_display = ('username', 'email', 'is_staff', 'get_roles', 'get_profile_status')
    inlines = (StudentProfileInline, StaffProfileInline)
    actions = ('deactivate_users', 'delete_and_purge_users')

    def deactivate_users(self, request, queryset):
        from .services import deactivate_user
        for u in queryset:
            try:
                deactivate_user(u, reason='deactivated via admin', actor=request.user)
            except Exception:
                pass
    deactivate_users.short_description = 'Deactivate selected users'

    def delete_and_purge_users(self, request, queryset):
        """Permanently delete selected users and their profiles.

        This action will delete the linked StudentProfile/StaffProfile (if any)
        and then delete the User. Use with caution: this performs hard deletes
        and will remove related objects according to DB cascade rules.
        """
        from django.db import transaction

        for u in queryset:
            try:
                with transaction.atomic():
                    # delete profile first (safe) then user
                    sp = getattr(u, 'student_profile', None)
                    st = getattr(u, 'staff_profile', None)
                    if sp is not None:
                        sp.delete()
                    if st is not None:
                        st.delete()
                    u.delete()
            except Exception:
                # swallow to continue with other users; admin will show success count
                pass
    delete_and_purge_users.short_description = 'Permanently delete selected users and their profiles'

    def get_roles(self, obj):
        return ", ".join([r.name for r in obj.roles.all()])
    get_roles.short_description = 'Roles'

    def get_profile_status(self, obj):
        sp = getattr(obj, 'student_profile', None)
        if sp is not None:
            return sp.status
        st = getattr(obj, 'staff_profile', None)
        if st is not None:
            return st.status
        return None
    get_profile_status.short_description = 'Profile Status'


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'get_permissions')

    def get_permissions(self, obj):
        return ", ".join([rp.permission.code for rp in obj.role_permissions.all()])
    get_permissions.short_description = 'Permissions'


class UserRoleForm(forms.ModelForm):
    class Meta:
        model = UserRole
        fields = '__all__'

    def clean(self):
        cleaned = super().clean()
        user = cleaned.get('user') or (self.instance.user if self.instance and self.instance.pk else None)
        role = cleaned.get('role') or (self.instance.role if self.instance and self.instance.pk else None)
        if user and role:
            try:
                validate_roles_for_user(user, [role])
            except ValidationError as e:
                raise ValidationError(e.messages)
        return cleaned


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    form = UserRoleForm
    list_display = ('user', 'role')


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('code', 'description')


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'permission')
