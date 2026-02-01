from django.contrib import admin
from django.urls import path, reverse
from django.http import JsonResponse
from django.shortcuts import render
from django.contrib import messages
from django.db import transaction
from django.utils import timezone
import json
from .models import (
    AcademicYear,
    Department,
    Program,
    Course,
    Semester,
    Section,
    Subject,
    PROFILE_STATUS_CHOICES,
    StudentProfile,
    StaffProfile,
    StudentSectionAssignment,
    StaffDepartmentAssignment,
    RoleAssignment,
)
from .models import TeachingAssignment
from .models import AttendanceSession, AttendanceRecord
from .models import StudentMentorMap, SectionAdvisor, DepartmentRole
from django import forms
from django.core.exceptions import ValidationError


class StudentProfileForm(forms.ModelForm):
    class Meta:
        model = StudentProfile
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            # disable reg_no editing for existing records in admin
            if 'reg_no' in self.fields:
                self.fields['reg_no'].disabled = True
            # deprecate editing section here; assignments should be used
            if 'section' in self.fields:
                self.fields['section'].disabled = True

    def clean_reg_no(self):
        val = self.cleaned_data.get('reg_no')
        if self.instance and self.instance.pk:
            # ensure immutability is enforced at form level with a friendly error
            if val != self.instance.reg_no:
                raise ValidationError('Student reg_no is immutable and cannot be changed.')
        return val


class StaffProfileForm(forms.ModelForm):
    class Meta:
        model = StaffProfile
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            # disable staff_id editing for existing records in admin
            if 'staff_id' in self.fields:
                self.fields['staff_id'].disabled = True
            # deprecate editing department here; assignments should be used
            if 'department' in self.fields:
                self.fields['department'].disabled = True

    def clean_staff_id(self):
        val = self.cleaned_data.get('staff_id')
        if self.instance and self.instance.pk:
            # ensure immutability is enforced at form level with a friendly error
            if val != self.instance.staff_id:
                raise ValidationError('Staff staff_id is immutable and cannot be changed.')
        return val


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    form = StudentProfileForm
    list_display = ('user', 'reg_no', 'get_department', 'batch', 'current_section_display', 'status')
    search_fields = ('reg_no', 'user__username', 'user__email')
    # filter by the department through the section->semester->course relation
    list_filter = ('section__semester__course__department', 'batch')
    actions = ('deactivate_students', 'mark_alumni', 'delete_profiles_and_users')

    change_list_template = 'admin/academics/studentprofile/change_list.html'

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path('sheets/', self.admin_site.admin_view(self.sheets_view), name='academics_studentprofile_sheets'),
            path('sheets/data/', self.admin_site.admin_view(self.sheets_data_view), name='academics_studentprofile_sheets_data'),
            path('sheets/save/', self.admin_site.admin_view(self.sheets_save_view), name='academics_studentprofile_sheets_save'),
        ]
        return custom + urls

    def sheets_view(self, request):
        if not self.has_add_permission(request):
            messages.error(request, 'You do not have permission to use Sheets.')
            return render(request, 'admin/academics/studentprofile/sheets.html', {
                **self.admin_site.each_context(request),
                'title': 'Student Profiles Sheets',
                'sections': [],
                'status_choices': list(PROFILE_STATUS_CHOICES),
                'data_url': reverse('admin:academics_studentprofile_sheets_data'),
                'save_url': reverse('admin:academics_studentprofile_sheets_save'),
            })

        sections_qs = Section.objects.select_related('semester__course__department').all().order_by(
            'semester__course__department__code', 'semester__course__name', 'semester__number', 'name'
        )
        sections = [{'id': s.pk, 'label': str(s)} for s in sections_qs]

        return render(request, 'admin/academics/studentprofile/sheets.html', {
            **self.admin_site.each_context(request),
            'title': 'Student Profiles Sheets',
            'sections': sections,
            'status_choices': list(PROFILE_STATUS_CHOICES),
            'data_url': reverse('admin:academics_studentprofile_sheets_data'),
            'save_url': reverse('admin:academics_studentprofile_sheets_save'),
        })

    def sheets_data_view(self, request):
        if request.method != 'GET':
            return JsonResponse({'detail': 'Method not allowed'}, status=405)

        if not self.has_add_permission(request):
            return JsonResponse({'detail': 'Forbidden'}, status=403)

        # show all users (include existing students). Frontend will mark existing profiles as read-only.
        from accounts.models import User

        qs = User.objects.all().order_by('username').select_related('student_profile__section', 'staff_profile')
        rows = []
        for u in qs:
            sp = getattr(u, 'student_profile', None)
            rows.append({
                'id': u.pk,
                'username': u.username,
                'email': u.email or '',
                'has_student_profile': sp is not None,
                'reg_no': sp.reg_no if sp is not None else '',
                'section_id': sp.section.pk if (sp is not None and sp.section) else '',
                'section_label': str(sp.section) if (sp is not None and sp.section) else '',
                'batch': sp.batch if sp is not None else '',
                'status': sp.status if sp is not None else 'ACTIVE',
            })
        return JsonResponse({'rows': rows})

    def sheets_save_view(self, request):
        if request.method != 'POST':
            return JsonResponse({'detail': 'Method not allowed'}, status=405)

        if not self.has_add_permission(request):
            return JsonResponse({'detail': 'Forbidden'}, status=403)

        try:
            payload = json.loads((request.body or b'{}').decode('utf-8'))
        except Exception:
            return JsonResponse({'detail': 'Invalid JSON body'}, status=400)

        rows = payload.get('rows') or []
        if not isinstance(rows, list) or not rows:
            return JsonResponse({'detail': 'No rows provided'}, status=400)

        from accounts.models import User

        created = 0
        failed = []
        today = timezone.now().date()

        for idx, r in enumerate(rows, start=1):
            try:
                user_id = int(r.get('user_id'))
            except Exception:
                failed.append({'index': idx, 'user_id': r.get('user_id'), 'error': 'Invalid user_id'})
                continue

            reg_no = (r.get('reg_no') or '').strip()
            batch = (r.get('batch') or '').strip()
            status = (r.get('status') or 'ACTIVE').strip().upper()
            section_id = (r.get('section_id') or '').strip()

            if not reg_no:
                failed.append({'index': idx, 'user_id': user_id, 'error': 'reg_no is required'})
                continue

            if status not in {c[0] for c in PROFILE_STATUS_CHOICES}:
                failed.append({'index': idx, 'user_id': user_id, 'error': f'Invalid status: {status}'})
                continue

            try:
                user = User.objects.select_related('student_profile', 'staff_profile').get(pk=user_id)
            except User.DoesNotExist:
                failed.append({'index': idx, 'user_id': user_id, 'error': 'User not found'})
                continue

            if getattr(user, 'student_profile', None) is not None:
                failed.append({'index': idx, 'user_id': user_id, 'error': 'User already has a StudentProfile'})
                continue

            if getattr(user, 'staff_profile', None) is not None:
                failed.append({'index': idx, 'user_id': user_id, 'error': 'User already has a StaffProfile'})
                continue

            section_obj = None
            if section_id:
                try:
                    section_obj = Section.objects.filter(pk=int(section_id)).first()
                except Exception:
                    section_obj = None

            try:
                with transaction.atomic():
                    sp = StudentProfile.objects.create(
                        user=user,
                        reg_no=reg_no,
                        section=section_obj,
                        batch=batch,
                        status=status,
                    )
                    # keep history assignment too (optional, but better for later changes)
                    if section_obj is not None:
                        StudentSectionAssignment.objects.create(student=sp, section=section_obj, start_date=today)
                    created += 1
            except Exception as e:
                failed.append({'index': idx, 'user_id': user_id, 'error': str(e)})

        return JsonResponse({'created': created, 'failed': failed})

    def deactivate_students(self, request, queryset):
        from accounts.services import deactivate_user
        for p in queryset:
            deactivate_user(p.user, profile_status='INACTIVE', reason='deactivated via admin', actor=request.user)
    deactivate_students.short_description = 'Deactivate selected student profiles'

    def mark_alumni(self, request, queryset):
        for p in queryset:
            p.status = 'ALUMNI'
            p.save(update_fields=['status'])
    mark_alumni.short_description = 'Mark selected students as ALUMNI'

    def get_department(self, obj):
        # obj.section -> semester -> course -> department
        sec = getattr(obj, 'section', None)
        if not sec:
            return None
        sem = getattr(sec, 'semester', None)
        if not sem:
            return None
        course = getattr(sem, 'course', None)
        if not course:
            return None
        dept = getattr(course, 'department', None)
        return dept

    get_department.short_description = 'Department'

    def current_section_display(self, obj):
        sec = obj.current_section
        if sec is None:
            return None
        return getattr(sec, 'name', str(sec))
    current_section_display.short_description = 'Current Section'


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    form = StaffProfileForm
    list_display = ('user', 'staff_id', 'current_department_display', 'designation', 'status')
    search_fields = ('staff_id', 'user__username', 'user__email')
    list_filter = ('department', 'designation')

    def has_delete_permission(self, request, obj=None):
        return False

    actions = ('deactivate_staff', 'mark_resigned', 'delete_profiles_and_users')

    def deactivate_staff(self, request, queryset):
        from accounts.services import deactivate_user
        for p in queryset:
            deactivate_user(p.user, profile_status='INACTIVE', reason='deactivated via admin', actor=request.user)
    deactivate_staff.short_description = 'Deactivate selected staff profiles'

    def mark_resigned(self, request, queryset):
        for p in queryset:
            p.status = 'RESIGNED'
            p.save(update_fields=['status'])
    mark_resigned.short_description = 'Mark selected staff as RESIGNED'

    def delete_profiles_and_users(self, request, queryset):
        from django.db import transaction
        for p in queryset:
            try:
                with transaction.atomic():
                    user = p.user
                    p.delete()
                    if user:
                        user.delete()
            except Exception:
                pass
    delete_profiles_and_users.short_description = 'Permanently delete selected profiles and their users'

    def current_department_display(self, obj):
        dept = obj.current_department
        if dept is None:
            return None
        return getattr(dept, 'code', str(dept))
    current_department_display.short_description = 'Current Department'


@admin.register(StudentSectionAssignment)
class StudentSectionAssignmentAdmin(admin.ModelAdmin):
    list_display = ('student', 'section', 'start_date', 'end_date', 'created_at')
    search_fields = ('student__reg_no', 'student__user__username')
    list_filter = ('section',)
    actions = ('end_assignments',)

    def end_assignments(self, request, queryset):
        from django.utils import timezone
        today = timezone.now().date()
        for a in queryset:
            if a.end_date is None:
                a.end_date = today
                a.save(update_fields=['end_date'])
    end_assignments.short_description = 'End selected student section assignments (set end_date to today)'


@admin.register(StaffDepartmentAssignment)
class StaffDepartmentAssignmentAdmin(admin.ModelAdmin):
    list_display = ('staff', 'department', 'start_date', 'end_date', 'created_at')
    search_fields = ('staff__staff_id', 'staff__user__username')
    list_filter = ('department',)
    actions = ('end_assignments',)

    def end_assignments(self, request, queryset):
        from django.utils import timezone
        today = timezone.now().date()
        for a in queryset:
            if a.end_date is None:
                a.end_date = today
                a.save(update_fields=['end_date'])
    end_assignments.short_description = 'End selected staff department assignments (set end_date to today)'


@admin.register(RoleAssignment)
class RoleAssignmentAdmin(admin.ModelAdmin):
    list_display = ('staff', 'role_name', 'start_date', 'end_date', 'created_at')
    search_fields = ('staff__staff_id', 'role_name', 'staff__user__username')
    list_filter = ('role_name',)
    actions = ('end_assignments',)

    def end_assignments(self, request, queryset):
        from django.utils import timezone
        today = timezone.now().date()
        for a in queryset:
            if a.end_date is None:
                a.end_date = today
                a.save(update_fields=['end_date'])
    end_assignments.short_description = 'End selected role assignments (set end_date to today)'



@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active')
    list_editable = ('is_active',)
    search_fields = ('name',)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('code', 'name')
    search_fields = ('code', 'name')


@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'program')
    search_fields = ('name',)
    list_filter = ('department', 'program')


@admin.register(Semester)
class SemesterAdmin(admin.ModelAdmin):
    list_display = ('course', 'number')
    search_fields = ('course__name',)
    list_filter = ('course',)


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ('semester', 'name')
    search_fields = ('name',)
    list_filter = ('semester',)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'semester')
    search_fields = ('code', 'name')
    list_filter = ('semester',)


@admin.register(TeachingAssignment)
class TeachingAssignmentAdmin(admin.ModelAdmin):
    list_display = ('staff', 'subject', 'section', 'academic_year', 'is_active')
    search_fields = (
        'staff__staff_id', 'staff__user__username', 'subject__code', 'subject__name', 'section__name'
    )
    list_filter = ('academic_year', 'is_active', 'section__semester__course__department')
    raw_id_fields = ('staff', 'subject', 'section', 'academic_year')


@admin.register(AttendanceSession)
class AttendanceSessionAdmin(admin.ModelAdmin):
    list_display = ('teaching_assignment', 'date', 'period', 'created_by', 'is_locked', 'created_at')
    search_fields = (
        'teaching_assignment__staff__staff_id', 'teaching_assignment__subject__code', 'teaching_assignment__section__name'
    )
    list_filter = ('date', 'is_locked', 'teaching_assignment__academic_year', 'teaching_assignment__section__semester__course__department')
    raw_id_fields = ('teaching_assignment', 'created_by')


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ('attendance_session', 'student', 'status', 'marked_at')
    search_fields = ('student__reg_no', 'student__user__username')
    list_filter = ('status', 'attendance_session__date', 'attendance_session__teaching_assignment__academic_year')
    raw_id_fields = ('attendance_session', 'student')


@admin.register(StudentMentorMap)
class StudentMentorMapAdmin(admin.ModelAdmin):
    list_display = ('student', 'mentor', 'academic_year', 'is_active')
    list_filter = ('academic_year', 'is_active', 'student__section__semester__course__department')
    search_fields = ('student__reg_no', 'mentor__staff_id', 'mentor__user__username')
    raw_id_fields = ('student', 'mentor', 'academic_year')


@admin.register(SectionAdvisor)
class SectionAdvisorAdmin(admin.ModelAdmin):
    list_display = ('section', 'advisor', 'academic_year', 'is_active')
    list_filter = ('academic_year', 'is_active', 'section__semester__course__department')
    search_fields = ('section__name', 'advisor__staff_id', 'advisor__user__username')
    raw_id_fields = ('section', 'advisor', 'academic_year')


@admin.register(DepartmentRole)
class DepartmentRoleAdmin(admin.ModelAdmin):
    list_display = ('department', 'role', 'staff', 'academic_year', 'is_active')
    list_filter = ('academic_year', 'is_active', 'department', 'role')
    search_fields = ('staff__staff_id', 'staff__user__username')
    raw_id_fields = ('staff', 'academic_year')
