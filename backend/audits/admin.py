from django.contrib import admin
from django.utils.html import format_html

from .models import (
    AuditATR,
    AuditCycle,
    AuditDepartmentAssignment,
    AuditQuestion,
    AuditScore,
    AuditQuestionSet,
    AuditRubric,
)
from .services import get_assignment_totals


# ─────────────────────────────────────────────────────────────────────────────
# Cycles
# ─────────────────────────────────────────────────────────────────────────────


@admin.register(AuditCycle)
class AuditCycleAdmin(admin.ModelAdmin):
    list_display = ('cycle', 'name', 'label', 'is_active', 'assignment_count')
    list_editable = ('name', 'label', 'is_active')
    ordering = ('cycle',)

    @admin.display(description='Assignments')
    def assignment_count(self, obj):
        return obj.assignments.count()


# ─────────────────────────────────────────────────────────────────────────────
# Questions
# ─────────────────────────────────────────────────────────────────────────────


@admin.register(AuditQuestion)
class AuditQuestionAdmin(admin.ModelAdmin):
    list_display = ('sl_no', 'details', 'max_marks', 'is_active')
    list_editable = ('max_marks', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('sl_no', 'details', 'documents_checklist', 'detailed_description')
    ordering = ('sl_no',)
    fieldsets = (
        (None, {'fields': ('sl_no', 'details', 'max_marks', 'is_active')}),
        ('Checklist & Description', {'fields': ('documents_checklist', 'detailed_description')}),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Assignments
# ─────────────────────────────────────────────────────────────────────────────


class AuditScoreInline(admin.TabularInline):
    model = AuditScore
    extra = 0
    fields = ('question', 'marks', 'comments', 'updated_by', 'updated_at')
    readonly_fields = ('updated_by', 'updated_at')


class AuditATRInline(admin.TabularInline):
    model = AuditATR
    extra = 0
    fields = ('question', 'action_taken', 'status', 'submitted_by', 'submitted_at')
    readonly_fields = ('submitted_by', 'submitted_at')


@admin.register(AuditDepartmentAssignment)
class AuditDepartmentAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        'department', 'cycle', 'status', 'auditor_names',
        'score_percentage', 'below_60_count', 'assigned_by', 'updated_at',
    )
    list_filter = ('cycle', 'status', 'department')
    search_fields = ('department__code', 'department__name', 'auditors__staff_id')
    filter_horizontal = ('auditors',)
    readonly_fields = ('assigned_by', 'created_at', 'updated_at')
    inlines = (AuditScoreInline, AuditATRInline)

    def get_queryset(self, request):
        return (
            super().get_queryset(request)
            .select_related('cycle', 'department', 'assigned_by')
            .prefetch_related('auditors__user', 'scores__question')
        )

    @admin.display(description='Auditors')
    def auditor_names(self, obj):
        names = []
        for a in obj.auditors.all():
            name = ''
            if a.user:
                name = f'{a.user.first_name} {a.user.last_name}'.strip() or a.user.username
            names.append(f'{name} ({a.staff_id})')
        return ', '.join(names) or '—'

    @admin.display(description='Score %')
    def score_percentage(self, obj):
        total, maximum, pct, below = get_assignment_totals(obj)
        color = '#16a34a' if pct >= 60 else '#dc2626'
        return format_html('<b style="color:{}">{}</b>', color, f'{pct}%' if maximum else '—')

    @admin.display(description='Below 60%')
    def below_60_count(self, obj):
        total, maximum, pct, below = get_assignment_totals(obj)
        if below:
            return format_html('<b style="color:#dc2626">{}</b>', below)
        return '0'


# ─────────────────────────────────────────────────────────────────────────────
# Scores & ATR (standalone management)
# ─────────────────────────────────────────────────────────────────────────────


@admin.register(AuditScore)
class AuditScoreAdmin(admin.ModelAdmin):
    list_display = ('assignment', 'question', 'marks', 'comments', 'updated_by', 'updated_at')
    list_filter = ('assignment__cycle', 'assignment__department')
    search_fields = ('assignment__department__code', 'question__details', 'comments')
    readonly_fields = ('updated_by', 'updated_at')
    autocomplete_fields = ('assignment', 'question')


@admin.register(AuditATR)
class AuditATRAdmin(admin.ModelAdmin):
    list_display = ('assignment', 'question', 'action_taken', 'status', 'submitted_by', 'submitted_at')
    list_filter = ('status', 'assignment__cycle', 'assignment__department')
    search_fields = ('assignment__department__code', 'question__details', 'action_taken')
    readonly_fields = ('submitted_by', 'submitted_at')
    autocomplete_fields = ('assignment', 'question')


# ─────────────────────────────────────────────────────────────────────────────
# Question Sets & Rubrics
# ─────────────────────────────────────────────────────────────────────────────


@admin.register(AuditQuestionSet)
class AuditQuestionSetAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'created_by', 'created_at', 'is_active')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'description')
    filter_horizontal = ('questions',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(AuditRubric)
class AuditRubricAdmin(admin.ModelAdmin):
    list_display = ('name', 'file', 'uploaded_by', 'uploaded_at', 'is_active')
    list_filter = ('is_active', 'uploaded_at')
    search_fields = ('name',)
    readonly_fields = ('uploaded_at',)

