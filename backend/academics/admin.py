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
)


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'reg_no', 'get_department', 'batch', 'section')
    search_fields = ('reg_no', 'user__username', 'user__email')
    # filter by the department through the section->semester->course relation
    list_filter = ('section__semester__course__department', 'batch')

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


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'staff_id', 'department', 'designation')
    search_fields = ('staff_id', 'user__username', 'user__email')
    list_filter = ('department', 'designation')


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
