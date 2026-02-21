from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html
from .models import User, Role, UserRole, Permission, RolePermission
from academics.models import StudentProfile, StaffProfile, Section, Department
from django import forms
from django.core.exceptions import ValidationError
from .models import validate_roles_for_user

from django.urls import path
from django.shortcuts import render
from django.contrib import messages
from django.db import transaction
from django.template.loader import get_template
from django.template import TemplateDoesNotExist

import csv
import io
import uuid


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
    list_display = ('username', 'email', 'mobile_no', 'is_staff', 'get_roles', 'get_profile_status')
    inlines = (StudentProfileInline, StaffProfileInline)
    actions = ('deactivate_users', 'delete_and_purge_users')
    change_list_template = 'admin/accounts/user/change_list.html'

    fieldsets = DjangoUserAdmin.fieldsets + (
        ('Contact', {'fields': ('mobile_no',)}),
    )

    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ('Contact', {'fields': ('mobile_no',)}),
    )

    def changelist_view(self, request, extra_context=None):
        """Render the changelist using our custom template when available.

        If the custom template cannot be loaded for any reason, fall back to
        the default admin changelist to avoid raising TemplateDoesNotExist
        and returning a 500 to the user.
        """
        extra_context = extra_context or {}
        try:
            # attempt to resolve the custom template; this may raise
            # TemplateDoesNotExist in environments where the template
            # isn't present for the running process.
            get_template('admin/accounts/user/change_list.html')
            return super().changelist_view(request, extra_context=extra_context)
        except TemplateDoesNotExist:
            # Temporarily remove the custom attribute and call the
            # superclass implementation so the default template is used.
            old = getattr(self, 'change_list_template', None)
            if old:
                try:
                    delattr(self, 'change_list_template')
                except Exception:
                    pass
                try:
                    return super().changelist_view(request, extra_context=extra_context)
                finally:
                    # restore attribute for other callers
                    try:
                        setattr(self, 'change_list_template', old)
                    except Exception:
                        pass
            # if no custom was set, just call through
            return super().changelist_view(request, extra_context=extra_context)

    CSV_COLUMNS = [
        'username',
        'email',
        'password',
        'profile_type',
        'section',
        'reg_no',
        'staff_id',
        'department_code',
        'designation',
        'batch',
        'status',
        'roles',
    ]

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path('import-users/', self.admin_site.admin_view(self.import_users_view), name='accounts_user_import'),
        ]
        return custom + urls

    def import_users_view(self, request):
        # Restrict: only allow staff who can add users
        if not self.has_add_permission(request):
            messages.error(request, 'You do not have permission to import users.')
            ctx = {**self.admin_site.each_context(request), 'title': 'Import Users (CSV)'}
            return render(request, 'admin/accounts/user/import_users.html', ctx)

        stage = request.POST.get('stage') if request.method == 'POST' else 'upload'

        ctx = {
            **self.admin_site.each_context(request),
            'title': 'Import Users (CSV)',
            'stage': stage,
            'columns': self.CSV_COLUMNS,
            'sample_row': {
                'username': 'john_doe',
                'email': 'john@example.com',
                'password': 'ChangeMe@123',
                'profile_type': 'STUDENT',
                'section': '',
                'reg_no': '22CS001',
                'staff_id': '',
                'department_code': '',
                'designation': '',
                'batch': '2022',
                'status': 'ACTIVE',
                'roles': 'STUDENT',
            },
        }

        if request.method == 'GET':
            ctx['stage'] = 'upload'
            return render(request, 'admin/accounts/user/import_users.html', ctx)

        # POST flow
        if stage == 'preview':
            f = request.FILES.get('csv_file')

            # mapping submission posts mapping_token + map_* fields but no file
            mapping_token_post = request.POST.get('mapping_token')
            mapping_token = mapping_token_post or request.session.get('accounts_user_import_last_token')
            expected = self.CSV_COLUMNS

            raw = None
            headers = None
            mapped_rows = None
            mapping_applied = False

            if mapping_token_post and not f:
                raw = request.session.get(f'accounts_user_import_raw_{mapping_token_post}')
                if not raw:
                    messages.error(request, 'Import session expired. Please upload the CSV again.')
                    ctx['stage'] = 'upload'
                    return render(request, 'admin/accounts/user/import_users.html', ctx)

                # build mapping info from POST (supports column names containing underscores)
                mapping = {}
                for key, val in request.POST.items():
                    if key.startswith('map_'):
                        body = key[len('map_'):]
                        if '_' in body:
                            col, sub = body.rsplit('_', 1)
                            mapping.setdefault(col, {})[sub] = val

                rows_raw = list(csv.DictReader(io.StringIO(raw)))
                for r in rows_raw:
                    for col, m in mapping.items():
                        mtype = m.get('type')
                        if mtype == 'csv':
                            src = m.get('col')
                            r[col] = r.get(src, '')
                        elif mtype == 'static':
                            r[col] = m.get('val', '')
                        elif mtype == 'empty':
                            r[col] = ''

                    # Ensure required keys exist for downstream validation/preview.
                    for col in expected:
                        if col not in r:
                            r[col] = ''

                mapped_rows = rows_raw
                headers = expected
                mapping_applied = True

            if not mapping_applied:
                if not f:
                    messages.error(request, 'Please choose a CSV file.')
                    ctx['stage'] = 'upload'
                    return render(request, 'admin/accounts/user/import_users.html', ctx)

                try:
                    raw = f.read().decode('utf-8-sig')
                except Exception:
                    messages.error(request, 'Unable to read the file. Please upload a UTF-8 CSV.')
                    ctx['stage'] = 'upload'
                    return render(request, 'admin/accounts/user/import_users.html', ctx)

                reader = csv.reader(io.StringIO(raw))
                try:
                    headers = next(reader)
                except StopIteration:
                    messages.error(request, 'CSV is empty.')
                    ctx['stage'] = 'upload'
                    return render(request, 'admin/accounts/user/import_users.html', ctx)
            # Only enforce strict header match on first upload; when mapping_token is used we skip this check
            if not mapping_token and headers != expected:
                # save raw upload to session and offer a mapping UI so admin can
                # map missing columns to existing CSV columns or choose a single
                # static value from a related model (e.g. Section).
                token = uuid.uuid4().hex
                request.session[f'accounts_user_import_raw_{token}'] = raw
                request.session['accounts_user_import_last_token'] = token
                request.session.modified = True

                found = list(headers)
                missing = [c for c in expected if c not in found]

                # prepare model choices for known columns
                section_choices = []
                dept_choices = []
                role_choices = []
                try:
                    section_qs = Section.objects.select_related('semester__course').all().order_by('semester__course__name', 'semester__number', 'name')
                    section_choices = [{'pk': s.pk, 'label': str(s)} for s in section_qs]
                    dept_qs = Department.objects.all().order_by('code')
                    dept_choices = [{'code': d.code, 'label': str(d)} for d in dept_qs]
                    role_qs = Role.objects.all().order_by('name')
                    role_choices = [{'name': r.name, 'label': str(r)} for r in role_qs]
                except Exception:
                    section_choices = []
                    dept_choices = []
                    role_choices = []

                ctx.update({
                    'stage': 'map',
                    'mapping_token': token,
                    'missing_columns': missing,
                    'found_headers': found,
                    'required_columns': expected,
                    'sample_rows': list(csv.DictReader(io.StringIO(raw)))[:5],
                    'section_choices': section_choices,
                    'dept_choices': dept_choices,
                    'role_choices': role_choices,
                })
                return render(request, 'admin/accounts/user/import_users.html', ctx)

            if mapped_rows is not None:
                dict_reader = mapped_rows  # already list of dicts
            else:
                dict_reader = csv.DictReader(io.StringIO(raw))

            # If required columns are present but all values are empty, prompt mapping selection.
            rows_list = list(dict_reader)
            required_empty = []
            for col in ['profile_type', 'roles']:
                if all((r.get(col) or '').strip() == '' for r in rows_list):
                    required_empty.append(col)

            if required_empty and not mapping_token:
                token = uuid.uuid4().hex
                request.session[f'accounts_user_import_raw_{token}'] = raw
                request.session['accounts_user_import_last_token'] = token
                request.session.modified = True

                found = list(headers)
                missing = [c for c in expected if c not in found]
                missing = missing + required_empty

                section_choices = []
                dept_choices = []
                role_choices = []
                try:
                    section_qs = Section.objects.select_related('semester__course').all().order_by('semester__course__name', 'semester__number', 'name')
                    section_choices = [{'pk': s.pk, 'label': str(s)} for s in section_qs]
                    dept_qs = Department.objects.all().order_by('code')
                    dept_choices = [{'code': d.code, 'label': str(d)} for d in dept_qs]
                    role_qs = Role.objects.all().order_by('name')
                    role_choices = [{'name': r.name, 'label': str(r)} for r in role_qs]
                except Exception:
                    section_choices = []
                    dept_choices = []
                    role_choices = []

                ctx.update({
                    'stage': 'map',
                    'mapping_token': token,
                    'missing_columns': missing,
                    'found_headers': found,
                    'required_columns': expected,
                    'sample_rows': rows_list[:5],
                    'section_choices': section_choices,
                    'dept_choices': dept_choices,
                    'role_choices': role_choices,
                })
                return render(request, 'admin/accounts/user/import_users.html', ctx)

            # continue using rows_list as the reader content
            dict_reader = rows_list
            rows = []
            row_errors = []
            for idx, r in enumerate(dict_reader, start=2):
                # Normalize keys are already correct; values keep as-is
                username = (r.get('username') or '').strip()
                email = (r.get('email') or '').strip()
                password = (r.get('password') or '').strip()
                profile_type = (r.get('profile_type') or '').strip().upper()
                section = (r.get('section') or '').strip()
                reg_no = (r.get('reg_no') or '').strip()
                staff_id = (r.get('staff_id') or '').strip()
                department_code = (r.get('department_code') or '').strip()
                designation = (r.get('designation') or '').strip()
                batch = (r.get('batch') or '').strip()
                status = (r.get('status') or 'ACTIVE').strip().upper()
                roles_raw = (r.get('roles') or '').strip()

                errs = []
                if not username:
                    errs.append('username is required')
                if not password:
                    errs.append('password is required')
                if profile_type not in ('STUDENT', 'STAFF'):
                    errs.append('profile_type must be STUDENT or STAFF')
                if profile_type == 'STUDENT' and not reg_no:
                    errs.append('reg_no is required for STUDENT')
                if profile_type == 'STAFF' and not staff_id:
                    errs.append('staff_id is required for STAFF')
                if status not in ('ACTIVE', 'INACTIVE', 'ALUMNI', 'RESIGNED'):
                    errs.append('status must be one of ACTIVE/INACTIVE/ALUMNI/RESIGNED')

                rows.append({
                    'row_num': idx,
                    'username': username,
                    'email': email,
                    'password': password,
                    'profile_type': profile_type,
                    'section': section,
                    'reg_no': reg_no,
                    'staff_id': staff_id,
                    'department_code': department_code,
                    'designation': designation,
                    'batch': batch,
                    'status': status,
                    'roles': roles_raw,
                })

                if errs:
                    row_errors.append({'row_num': idx, 'errors': errs})

            token = uuid.uuid4().hex
            request.session[f'accounts_user_import_{token}'] = rows
            request.session.modified = True

            ctx['stage'] = 'preview'
            ctx['token'] = token
            ctx['total_rows'] = len(rows)
            ctx['preview_rows'] = rows[:25]
            ctx['row_errors'] = row_errors[:50]
            return render(request, 'admin/accounts/user/import_users.html', ctx)

        if stage == 'confirm':
            token = request.POST.get('token') or ''
            key = f'accounts_user_import_{token}'
            rows = request.session.get(key)
            if not token or not rows:
                messages.error(request, 'Import session expired. Please upload the CSV again.')
                ctx['stage'] = 'upload'
                return render(request, 'admin/accounts/user/import_users.html', ctx)

            created = 0
            failed = []

            for r in rows:
                row_num = r.get('row_num')
                try:
                    with transaction.atomic():
                        u = User.objects.create_user(
                            username=r.get('username'),
                            email=r.get('email') or None,
                            password=r.get('password'),
                        )

                        profile_type = (r.get('profile_type') or '').upper()
                        status = (r.get('status') or 'ACTIVE').upper()

                        if profile_type == 'STUDENT':
                            # resolve optional section value (accept PK or exact name)
                            sect_obj = None
                            sect_val = (r.get('section') or '').strip()
                            if sect_val:
                                try:
                                    # try numeric PK
                                    pk = int(sect_val)
                                    sect_obj = Section.objects.filter(pk=pk).first()
                                except Exception:
                                    # try by name (case-insensitive)
                                    sect_obj = Section.objects.filter(name__iexact=sect_val).first()

                            StudentProfile.objects.create(
                                user=u,
                                reg_no=r.get('reg_no'),
                                section=sect_obj,
                                batch=r.get('batch') or '',
                                status=status,
                            )
                            default_roles = ['STUDENT']
                        else:
                            # Allow staff_id to be auto-filled when blank to let admin ignore the column.
                            staff_id_val = (r.get('staff_id') or '').strip()
                            if not staff_id_val:
                                staff_id_val = f"STAFF-{r.get('username')}"

                            dept = None
                            dept_code = (r.get('department_code') or '').strip()
                            if dept_code:
                                dept = Department.objects.filter(code__iexact=dept_code).first()

                            StaffProfile.objects.create(
                                user=u,
                                staff_id=staff_id_val,
                                department=dept,
                                designation=r.get('designation') or '',
                                status=status,
                            )
                            default_roles = ['STAFF']

                        roles_raw = (r.get('roles') or '').strip()
                        if roles_raw:
                            # support both comma and semicolon separated roles
                            parts = roles_raw.replace(';', ',').split(',')
                            role_names = [x.strip().upper() for x in parts if x.strip()]
                        else:
                            role_names = default_roles

                        # Resolve roles case-insensitively. If a standard role is missing, auto-create it.
                        auto_creatable = {'STUDENT', 'STAFF', 'FACULTY', 'ADVISOR', 'HOD', 'ADMIN'}
                        roles = []
                        missing = []
                        for rn in role_names:
                            role = Role.objects.filter(name__iexact=rn).first()
                            if role is None and rn in auto_creatable:
                                role, _ = Role.objects.get_or_create(name=rn, defaults={'description': ''})
                            if role is None:
                                missing.append(rn)
                            else:
                                roles.append(role)

                        if missing:
                            raise ValidationError(f"Unknown role(s): {', '.join(sorted(set(missing)))}")

                        # Assign roles (validates against profile type)
                        u.roles.set(roles)
                        created += 1
                except Exception as e:
                    failed.append({'row_num': row_num, 'username': r.get('username'), 'error': str(e)})

            # cleanup
            try:
                del request.session[key]
                request.session.modified = True
            except Exception:
                pass

            ctx['stage'] = 'result'
            ctx['created'] = created
            ctx['failed'] = failed
            return render(request, 'admin/accounts/user/import_users.html', ctx)

        # fallback
        ctx['stage'] = 'upload'
        return render(request, 'admin/accounts/user/import_users.html', ctx)

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
