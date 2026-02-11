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
    Batch,
    Subject,
    PROFILE_STATUS_CHOICES,
    StudentProfile,
    StaffProfile,
    StudentSectionAssignment,
    StaffDepartmentAssignment,
    RoleAssignment,
    SpecialCourseAssessmentSelection,
    SpecialCourseAssessmentEditRequest,
)
from .models import TeachingAssignment
from .models import StudentMentorMap, SectionAdvisor, DepartmentRole
from .models import StudentSubjectBatch
from .models import PeriodAttendanceSession, PeriodAttendanceRecord
from django import forms
from django.db import models
from django.core.exceptions import ValidationError

try:
    from curriculum.models import SPECIAL_ASSESSMENT_CHOICES
except Exception:
    SPECIAL_ASSESSMENT_CHOICES = (
        ('ssa1', 'SSA 1'),
        ('ssa2', 'SSA 2'),
        ('formative1', 'Formative 1'),
        ('formative2', 'Formative 2'),
        ('cia1', 'CIA 1'),
        ('cia2', 'CIA 2'),
    )


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
    list_filter = ('section__batch__course__department', 'batch')
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
        # section is now batch-wise; resolve course via batch
        batch = getattr(sec, 'batch', None)
        if not batch:
            return None
        course = getattr(batch, 'course', None)
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
    list_display = ('name', 'parity', 'is_active')
    list_editable = ('is_active',)
    list_filter = ('parity', 'is_active')
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
    # `course` was removed from Semester; show the semester number only.
    list_display = ('number',)
    search_fields = ()
    list_filter = ('number',)


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ('batch', 'name', 'semester')
    search_fields = ('name',)
    list_filter = ('batch',)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'course', 'semester')
    search_fields = ('code', 'name')
    list_filter = ('course', 'semester')


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ('name', 'course', 'start_year', 'end_year')
    search_fields = ('name', 'course__name')
    list_filter = ('course',)


@admin.register(TeachingAssignment)
class TeachingAssignmentAdmin(admin.ModelAdmin):
    list_display = ('staff', 'subject_display', 'section', 'academic_year', 'is_active')
    search_fields = (
        'staff__staff_id', 'staff__user__username', 'subject__code', 'subject__name', 'section__name'
    )
    list_filter = ('academic_year', 'is_active', 'section__batch__course__department')
    raw_id_fields = ('staff', 'curriculum_row', 'section', 'academic_year')

    def subject_display(self, obj):
        try:
            from curriculum.models import CurriculumDepartment
            # prefer explicit curriculum_row if set
            if getattr(obj, 'curriculum_row', None):
                cr = obj.curriculum_row
                return f"{cr.course_code or ''} - {cr.course_name or ''}".strip(' -')

            # if subject exists, show its name/code
            if getattr(obj, 'subject', None):
                try:
                    return getattr(obj.subject, 'name') or getattr(obj.subject, 'code') or str(obj.subject)
                except Exception:
                    return str(obj.subject)

            # fallback: return first curriculum row for section's department
            dept = None
            try:
                dept = obj.section.batch.course.department
            except Exception:
                dept = None
            if dept is not None:
                row = CurriculumDepartment.objects.filter(department=dept).first()
            else:
                row = CurriculumDepartment.objects.first()
            if row:
                return f"{row.course_code or ''} - {row.course_name or ''}".strip(' -')
        except Exception:
            pass
        return 'No subject'

    subject_display.short_description = 'Subject (Curriculum)'


@admin.register(StudentMentorMap)
class StudentMentorMapAdmin(admin.ModelAdmin):
    list_display = ('student', 'mentor', 'is_active')
    list_filter = ('is_active', 'student__section__batch__course__department')
    search_fields = ('student__reg_no', 'mentor__staff_id', 'mentor__user__username')
    raw_id_fields = ('student', 'mentor')


@admin.register(SectionAdvisor)
class SectionAdvisorAdmin(admin.ModelAdmin):
    list_display = ('section', 'advisor', 'academic_year', 'is_active')
    list_filter = ('academic_year', 'is_active', 'section__batch__course__department')
    search_fields = ('section__name', 'advisor__staff_id', 'advisor__user__username')
    raw_id_fields = ('section', 'advisor', 'academic_year')


@admin.register(DepartmentRole)
class DepartmentRoleAdmin(admin.ModelAdmin):
    list_display = ('department', 'role', 'staff', 'academic_year', 'is_active')
    list_filter = ('academic_year', 'is_active', 'department', 'role')
    search_fields = ('staff__staff_id', 'staff__user__username')
    raw_id_fields = ('staff', 'academic_year')


# DayAttendance admin removed along with models


@admin.register(StudentSubjectBatch)
class StudentSubjectBatchAdmin(admin.ModelAdmin):
    list_display = ('name', 'staff', 'academic_year', 'curriculum_row', 'is_active', 'created_at')
    search_fields = ('name', 'staff__staff_id', 'staff__user__username')
    list_filter = ('academic_year', 'is_active')
    raw_id_fields = ('staff', 'curriculum_row')



class PeriodAttendanceRecordInline(admin.TabularInline):
    model = PeriodAttendanceRecord
    extra = 0
    readonly_fields = ('marked_at',)


@admin.register(PeriodAttendanceSession)
class PeriodAttendanceSessionAdmin(admin.ModelAdmin):
    list_display = ('section', 'period', 'date', 'timetable_assignment', 'created_by', 'is_locked', 'created_at')
    list_filter = ('date', 'is_locked')
    raw_id_fields = ('section', 'period', 'timetable_assignment', 'created_by')
    inlines = (PeriodAttendanceRecordInline,)


@admin.register(PeriodAttendanceRecord)
class PeriodAttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ('session', 'student', 'status', 'marked_at', 'marked_by')
    search_fields = ('student__reg_no', 'student__user__username')
    list_filter = ('status',)
    raw_id_fields = ('session', 'student', 'marked_by')


class SpecialCourseAssessmentEditRequestInline(admin.TabularInline):
    model = SpecialCourseAssessmentEditRequest
    extra = 0
    fields = ('requested_by', 'status', 'requested_at', 'reviewed_by', 'reviewed_at', 'can_edit_until', 'used_at')
    readonly_fields = ('requested_at', 'reviewed_at', 'used_at')
    raw_id_fields = ('requested_by', 'reviewed_by')


class SpecialCourseAssessmentSelectionAdminForm(forms.ModelForm):
    enabled_assessments = forms.MultipleChoiceField(
        choices=SPECIAL_ASSESSMENT_CHOICES,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text='Enabled assessment tables for this SPECIAL course (saved globally per academic year).',
    )

    class Meta:
        model = SpecialCourseAssessmentSelection
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        inst = getattr(self, 'instance', None)
        if inst and getattr(inst, 'enabled_assessments', None):
            self.fields['enabled_assessments'].initial = list(inst.enabled_assessments or [])

    def clean_enabled_assessments(self):
        vals = self.cleaned_data.get('enabled_assessments') or []
        return [str(v).strip().lower() for v in vals if str(v).strip()]

    def clean(self):
        cleaned = super().clean()
        ea = cleaned.get('enabled_assessments') or []
        if not ea:
            self.add_error('enabled_assessments', 'Select at least one assessment for Special courses.')
        return cleaned


@admin.register(SpecialCourseAssessmentSelection)
class SpecialCourseAssessmentSelectionAdmin(admin.ModelAdmin):
    form = SpecialCourseAssessmentSelectionAdminForm
    list_display = (
        'id',
        'master_course_code',
        'master_course_name',
        'department_code',
        'academic_year',
        'locked',
        'enabled_assessments_display',
        'updated_at',
    )
    list_filter = (
        'academic_year',
        'locked',
        'curriculum_row__department',
        'curriculum_row__master__regulation',
        'curriculum_row__master__semester',
    )
    search_fields = (
        'curriculum_row__course_code',
        'curriculum_row__course_name',
        'curriculum_row__master__course_code',
        'curriculum_row__master__course_name',
        'curriculum_row__department__code',
    )
    raw_id_fields = ('curriculum_row', 'academic_year', 'created_by')
    readonly_fields = ('created_at', 'updated_at')
    inlines = (SpecialCourseAssessmentEditRequestInline,)

    def master_course_code(self, obj):
        try:
            m = getattr(getattr(obj, 'curriculum_row', None), 'master', None)
            return getattr(m, 'course_code', None) or getattr(obj.curriculum_row, 'course_code', None)
        except Exception:
            return None

    master_course_code.short_description = 'Course Code'

    def master_course_name(self, obj):
        try:
            m = getattr(getattr(obj, 'curriculum_row', None), 'master', None)
            return getattr(m, 'course_name', None) or getattr(obj.curriculum_row, 'course_name', None)
        except Exception:
            return None

    master_course_name.short_description = 'Course Name'

    def department_code(self, obj):
        try:
            return getattr(getattr(obj.curriculum_row, 'department', None), 'code', None)
        except Exception:
            return None

    department_code.short_description = 'Dept'

    def enabled_assessments_display(self, obj):
        vals = getattr(obj, 'enabled_assessments', None) or []
        if not vals:
            return '(none)'
        order = [k for k, _ in SPECIAL_ASSESSMENT_CHOICES]
        label_map = {k: v for k, v in SPECIAL_ASSESSMENT_CHOICES}
        normalized = {str(x).strip().lower() for x in vals}
        display = [label_map.get(k, k) for k in order if k in normalized]
        return ', '.join(display) if display else ', '.join(sorted(normalized))

    enabled_assessments_display.short_description = 'Assessments'

    def save_model(self, request, obj, form, change):
        """Keep SPECIAL selection global across all departments of the same master.

        The faculty UI treats enabled assessments as a *global* selection for a
        SPECIAL course (master) per academic year. Editing a single row in admin
        should propagate to all department rows to avoid mismatches.
        """
        actor_staff = getattr(getattr(request, 'user', None), 'staff_profile', None)
        with transaction.atomic():
            if not getattr(obj, 'created_by', None) and actor_staff:
                obj.created_by = actor_staff
            super().save_model(request, obj, form, change)

            master_id = None
            try:
                master_id = obj.curriculum_row.master_id
            except Exception:
                master_id = None

            if not master_id:
                return

            try:
                from curriculum.models import CurriculumDepartment

                dept_rows = CurriculumDepartment.objects.filter(master_id=master_id)
            except Exception:
                dept_rows = []

            for row in dept_rows:
                if not row:
                    continue
                sel, created = SpecialCourseAssessmentSelection.objects.get_or_create(
                    curriculum_row=row,
                    academic_year=obj.academic_year,
                    defaults={
                        'enabled_assessments': list(obj.enabled_assessments or []),
                        'locked': bool(obj.locked),
                        'created_by': obj.created_by,
                    },
                )
                if created:
                    continue
                if sel.enabled_assessments != obj.enabled_assessments or sel.locked != obj.locked:
                    sel.enabled_assessments = list(obj.enabled_assessments or [])
                    sel.locked = bool(obj.locked)
                    sel.save(update_fields=['enabled_assessments', 'locked', 'updated_at'])


@admin.register(SpecialCourseAssessmentEditRequest)
class SpecialCourseAssessmentEditRequestAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'course_code',
        'academic_year',
        'requested_by',
        'status',
        'requested_at',
        'can_edit_until',
        'used_at',
    )
    list_filter = ('status', 'selection__academic_year')
    search_fields = (
        'requested_by__staff_id',
        'requested_by__user__username',
        'selection__curriculum_row__course_code',
        'selection__curriculum_row__course_name',
        'selection__curriculum_row__master__course_code',
        'selection__curriculum_row__master__course_name',
    )
    raw_id_fields = ('selection', 'requested_by', 'reviewed_by')
    readonly_fields = ('requested_at',)

    def academic_year(self, obj):
        try:
            return obj.selection.academic_year
        except Exception:
            return None

    academic_year.short_description = 'Academic Year'

    def course_code(self, obj):
        try:
            cr = obj.selection.curriculum_row
            m = getattr(cr, 'master', None)
            return getattr(m, 'course_code', None) or getattr(cr, 'course_code', None)
        except Exception:
            return None

    course_code.short_description = 'Course Code'
