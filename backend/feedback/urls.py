from django.urls import path
from .views import (
    CreateFeedbackFormView,
    GetFeedbackFormsView,
    SubmitFeedbackView,
    GetUserDepartmentView,
    GetClassOptionsView,
    DeactivateFeedbackFormView,
    PublishFeedbackFormView,
    UpdateFeedbackFormView,
    GetResponseStatisticsView,
    GetResponseListView,
    ExportFeedbackResponsesExcelView,
    CommonFeedbackExportOptionsView,
    ExportCommonFeedbackResponsesExcelView,
    ExportYearsView,
    GetStudentSubjectsView,
    GetSubjectsByYearView,
    DeleteFeedbackFormView,
    DiagnosticElectiveChoicesView
)

urlpatterns = [
    # API 1: Create Feedback Form (HOD)
    path('create/', CreateFeedbackFormView.as_view(), name='feedback-create'),
    
    # API 2: Get Forms
    path('forms/', GetFeedbackFormsView.as_view(), name='feedback-forms'),
    
    # API 3: Submit Feedback
    path('submit/', SubmitFeedbackView.as_view(), name='feedback-submit'),
    
    # API 4: Get User's Department
    path('department/', GetUserDepartmentView.as_view(), name='user-department'),
    
    # API 5: Get Class Options
    path('class-options/', GetClassOptionsView.as_view(), name='class-options'),
    
    # API 6: Deactivate/Activate Feedback Form (HOD)
    path('<int:form_id>/toggle-active/', DeactivateFeedbackFormView.as_view(), name='feedback-toggle-active'),
    
    # API: Publish Feedback Form (HOD)
    path('<int:form_id>/publish/', PublishFeedbackFormView.as_view(), name='feedback-publish'),

    # API: Update Draft Feedback Form (HOD)
    path('<int:form_id>/update/', UpdateFeedbackFormView.as_view(), name='feedback-update'),
    
    # API 7: Get Response Statistics (HOD)
    path('<int:form_id>/statistics/', GetResponseStatisticsView.as_view(), name='feedback-statistics'),
    
    # API 8: Get Response List (HOD)
    path('<int:form_id>/responses/', GetResponseListView.as_view(), name='feedback-responses'),

    # API: Export Responses Excel (HOD)
    path('<int:form_id>/export-excel/', ExportFeedbackResponsesExcelView.as_view(), name='feedback-export-excel'),

    # API: IQAC Common Export (filters: department/year)
    path('common-export/options/', CommonFeedbackExportOptionsView.as_view(), name='feedback-common-export-options'),
    path('common-export/', ExportCommonFeedbackResponsesExcelView.as_view(), name='feedback-common-export'),

    # API: Export filter years (IQAC analytics)
    path('export-years/', ExportYearsView.as_view(), name='feedback-export-years'),
    
    # API 9: Get Student Subjects for Subject Feedback
    path('<int:form_id>/subjects/', GetStudentSubjectsView.as_view(), name='feedback-subjects'),
    
    # API 10: Get Subjects by Year (HOD - for form creation)
    path('subjects-by-year/', GetSubjectsByYearView.as_view(), name='subjects-by-year'),
    
    # API 11: Delete Feedback Form (HOD)
    path('<int:form_id>/delete/', DeleteFeedbackFormView.as_view(), name='feedback-delete'),
    
    # Diagnostic API: Check ElectiveChoice records
    path('diagnostic/elective-choices/', DiagnosticElectiveChoicesView.as_view(), name='diagnostic-elective-choices'),
]
