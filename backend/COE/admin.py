from django.contrib import admin
from .models import CoeArrearStudent, CoeAssignmentStore, CoeCourseSelectionStore, CoeExamDummy, CoeKeyValueStore, CoeStudentMarks


@admin.register(CoeExamDummy)
class CoeExamDummyAdmin(admin.ModelAdmin):
	list_display = ('dummy_number', 'student', 'semester', 'qp_type', 'created_at')
	search_fields = ('dummy_number', 'student__reg_no', 'student__user__first_name', 'student__user__last_name')
	list_filter = ('semester', 'qp_type')


@admin.register(CoeArrearStudent)
class CoeArrearStudentAdmin(admin.ModelAdmin):
	list_display = (
		'department',
		'semester',
		'batch',
		'course_code',
		'course_name',
		'student_register_number',
		'student_name',
		'updated_at',
	)
	search_fields = ('course_code', 'course_name', 'student_register_number', 'student_name', 'batch')
	list_filter = ('department', 'semester', 'batch')


@admin.register(CoeAssignmentStore)
class CoeAssignmentStoreAdmin(admin.ModelAdmin):
	list_display = ('store_key', 'updated_at', 'created_at')


@admin.register(CoeCourseSelectionStore)
class CoeCourseSelectionStoreAdmin(admin.ModelAdmin):
	list_display = ('store_key', 'is_locked', 'updated_at', 'created_at')
	list_filter = ('is_locked',)
	search_fields = ('store_key',)


@admin.register(CoeKeyValueStore)
class CoeKeyValueStoreAdmin(admin.ModelAdmin):
	list_display = ('store_name', 'updated_at', 'created_at')
	search_fields = ('store_name',)
	readonly_fields = ('created_at', 'updated_at')


@admin.register(CoeStudentMarks)
class CoeStudentMarksAdmin(admin.ModelAdmin):
	list_display = ('dummy_number', 'qp_type', 'updated_at', 'created_at')
	search_fields = ('dummy_number',)
	list_filter = ('qp_type',)
	readonly_fields = ('created_at', 'updated_at')
