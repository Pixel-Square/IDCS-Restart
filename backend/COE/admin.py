from django.contrib import admin
from .models import CoeArrearStudent, CoeExamDummy


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
