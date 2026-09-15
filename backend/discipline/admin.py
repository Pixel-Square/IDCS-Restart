from django.contrib import admin
from .models import DisciplineCategory, DisciplineIncidentLog


@admin.register(DisciplineCategory)
class DisciplineCategoryAdmin(admin.ModelAdmin):
    list_display = ('title', 'severity', 'is_active', 'created_at')
    list_filter = ('severity', 'is_active', 'created_at')
    search_fields = ('title', 'description')


@admin.register(DisciplineIncidentLog)
class DisciplineIncidentLogAdmin(admin.ModelAdmin):
    list_display = ('reg_no', 'student_name', 'category_title', 'severity', 'status', 'reported_by_name', 'incident_date')
    list_filter = ('status', 'severity', 'incident_date', 'department_name')
    search_fields = ('reg_no', 'student_name', 'username', 'category_title', 'remarks')
