from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered

from .models import QuestionBankQuestion, QuestionBankTitle


@admin.register(QuestionBankTitle)
class QuestionBankTitleAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'user', 'exam_type', 'exam_date', 'created_at')
    search_fields = ('title', 'user__username', 'user__email', 'faculty_identifier', 'exam_type')
    list_filter = ('exam_type', 'exam_date', 'created_at')


@admin.register(QuestionBankQuestion)
class QuestionBankQuestionAdmin(admin.ModelAdmin):
    list_display = ('id', 'title_obj', 'user', 'type', 'status', 'course_code', 'semester', 'updated_at')
    search_fields = ('question_text', 'answer_text', 'title', 'course_code', 'course_name', 'user__username', 'user__email')
    list_filter = ('type', 'status', 'excel_type', 'semester', 'updated_at')


# Register any remaining question_bank models without explicit admin classes above.
_question_bank_app_config = next((cfg for cfg in apps.get_app_configs() if cfg.name == 'question_bank'), None)
if _question_bank_app_config:
    for _model in _question_bank_app_config.get_models():
        if _model not in admin.site._registry:
            try:
                admin.site.register(_model)
            except AlreadyRegistered:
                pass
