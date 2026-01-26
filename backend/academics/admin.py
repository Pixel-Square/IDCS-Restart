from django.contrib import admin
from .models import (
    AcademicYear,
    Department,
    Program,
    Course,
    Semester,
    Section,
    Subject,
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
