from django.contrib import admin
from .models import FeedbackForm, FeedbackQuestion, FeedbackResponse


class FeedbackQuestionInline(admin.TabularInline):
    """Inline admin for questions within a feedback form."""
    model = FeedbackQuestion
    extra = 1
    fields = ('question', 'answer_type', 'order')
    ordering = ('order',)


@admin.register(FeedbackForm)
class FeedbackFormAdmin(admin.ModelAdmin):
    """Admin interface for Feedback Forms."""
    
    list_display = (
        'id',
        'get_form_type',
        'target_type',
        'department',
        'created_by',
        'active',
        'status',
        'created_at',
    )
    list_filter = (
        'target_type',
        'type',
        'status',
        'active',
        'department',
        'created_at',
    )
    search_fields = (
        'created_by__username',
        'created_by__first_name',
        'created_by__last_name',
        'department__name',
        'department__code',
    )
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Basic Information', {
            'fields': (
                'created_by',
                'target_type',
                'type',
                'department',
                'regulation',
            )
        }),
        ('Class Selection (Legacy Single Values)', {
            'fields': (
                'year',
                'semester',
                'section',
            ),
            'classes': ('collapse',),
        }),
        ('Class Selection (Multi-Select)', {
            'fields': (
                'years',
                'semesters',
                'sections',
            ),
            'classes': ('collapse',),
        }),
        ('Status', {
            'fields': (
                'status',
                'active',
            )
        }),
        ('Timestamps', {
            'fields': (
                'created_at',
                'updated_at',
            ),
            'classes': ('collapse',),
        }),
    )
    
    inlines = [FeedbackQuestionInline]
    
    def get_form_type(self, obj):
        """Display form type in a readable format."""
        return obj.get_type_display()
    get_form_type.short_description = 'Form Type'
    get_form_type.admin_order_field = 'type'
    
    def get_queryset(self, request):
        """Optimize queryset with select_related."""
        qs = super().get_queryset(request)
        return qs.select_related('created_by', 'department', 'semester', 'section', 'regulation')


@admin.register(FeedbackQuestion)
class FeedbackQuestionAdmin(admin.ModelAdmin):
    """Admin interface for Feedback Questions."""
    
    list_display = (
        'id',
        'feedback_form',
        'get_question_preview',
        'answer_type',
        'order',
        'created_at',
    )
    list_filter = (
        'answer_type',
        'feedback_form__type',
        'feedback_form__target_type',
        'created_at',
    )
    search_fields = (
        'question',
        'feedback_form__id',
        'feedback_form__department__name',
    )
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('feedback_form', 'order')
    
    fieldsets = (
        ('Question Details', {
            'fields': (
                'feedback_form',
                'question',
                'answer_type',
                'order',
            )
        }),
        ('Timestamps', {
            'fields': (
                'created_at',
                'updated_at',
            ),
            'classes': ('collapse',),
        }),
    )
    
    def get_question_preview(self, obj):
        """Display truncated question text."""
        max_length = 60
        if len(obj.question) > max_length:
            return f"{obj.question[:max_length]}..."
        return obj.question
    get_question_preview.short_description = 'Question'
    
    def get_queryset(self, request):
        """Optimize queryset with select_related."""
        qs = super().get_queryset(request)
        return qs.select_related('feedback_form', 'feedback_form__department')


@admin.register(FeedbackResponse)
class FeedbackResponseAdmin(admin.ModelAdmin):
    """Admin interface for Feedback Responses."""
    
    list_display = (
        'id',
        'feedback_form',
        'user',
        'get_question_preview',
        'answer_star',
        'get_answer_text_preview',
        'created_at',
    )
    list_filter = (
        'feedback_form__type',
        'feedback_form__target_type',
        'question__answer_type',
        'answer_star',
        'created_at',
    )
    search_fields = (
        'user__username',
        'user__first_name',
        'user__last_name',
        'answer_text',
        'question__question',
    )
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Response Details', {
            'fields': (
                'feedback_form',
                'question',
                'user',
            )
        }),
        ('Answer', {
            'fields': (
                'answer_star',
                'answer_text',
            )
        }),
        ('Timestamps', {
            'fields': (
                'created_at',
                'updated_at',
            ),
            'classes': ('collapse',),
        }),
    )
    
    def get_question_preview(self, obj):
        """Display truncated question text."""
        max_length = 40
        question = obj.question.question
        if len(question) > max_length:
            return f"{question[:max_length]}..."
        return question
    get_question_preview.short_description = 'Question'
    
    def get_answer_text_preview(self, obj):
        """Display truncated answer text."""
        if not obj.answer_text:
            return '-'
        max_length = 50
        if len(obj.answer_text) > max_length:
            return f"{obj.answer_text[:max_length]}..."
        return obj.answer_text
    get_answer_text_preview.short_description = 'Text Answer'
    
    def get_queryset(self, request):
        """Optimize queryset with select_related."""
        qs = super().get_queryset(request)
        return qs.select_related(
            'feedback_form',
            'feedback_form__department',
            'question',
            'user',
        )

