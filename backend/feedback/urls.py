from django.urls import path
from .views import (
    CreateFeedbackFormView,
    GetFeedbackFormsView,
    SubmitFeedbackView,
    GetUserDepartmentView,
    GetClassOptionsView,
    DeactivateFeedbackFormView,
    DeactivateAllFeedbackFormsView,
    DeactivateFilteredFeedbackFormsView,
    ActivateAllFeedbackFormsView,
    ActivateFilteredFeedbackFormsView,
    PublishFeedbackFormView,
    ToggleAllowHODViewView,
    PublishAllFeedbackFormsView,
    DeleteAllDeactivatedFeedbackFormsView,
    GetResponseStatisticsView,
    GetResponseListView,
    GetStudentSubjectsView,
    GetSubjectsByYearView,
    DeleteFeedbackFormView,
    DiagnosticElectiveChoicesView,
    IQACExportOptionsView,
    IQACExportYearsView,
    IQACCommonExportView,
    NonRespondersExportView,
    FormExportExcelView,
    SubjectWiseReportView,
    BulkSubjectWiseReportView,
    SubjectsFilterView,
    PrincipalCreateFeedbackView,
    PrincipalAnalyticsDashboardView,
    PrincipalFormAnalyticsView,
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

    # API: Deactivate all active forms (IQAC/Admin)
    path('deactivate-all/', DeactivateAllFeedbackFormsView.as_view(), name='feedback-deactivate-all'),

    # API: Deactivate filtered active forms (IQAC/Admin)
    path('deactivate-filtered/', DeactivateFilteredFeedbackFormsView.as_view(), name='feedback-deactivate-filtered'),

    # API: Activate all deactivated forms (IQAC/Admin)
    path('activate-all/', ActivateAllFeedbackFormsView.as_view(), name='feedback-activate-all'),

    # API: Activate filtered deactivated forms (IQAC/Admin)
    path('activate-filtered/', ActivateFilteredFeedbackFormsView.as_view(), name='feedback-activate-filtered'),
    
    # API: Publish all draft feedback forms (IQAC/Admin)
    path('publish-all/', PublishAllFeedbackFormsView.as_view(), name='feedback-publish-all'),
    
    # API: Delete all deactivated feedback forms (IQAC/Admin)
    path('delete-all-deactivated/', DeleteAllDeactivatedFeedbackFormsView.as_view(), name='feedback-delete-all-deactivated'),
    
    # API: Publish Feedback Form (HOD)
    path('<int:form_id>/publish/', PublishFeedbackFormView.as_view(), name='feedback-publish'),
    
    # API: Toggle Allow HOD View (IQAC/Admin/HOD for own forms)
    path('<int:form_id>/toggle-allow-hod-view/', ToggleAllowHODViewView.as_view(), name='feedback-toggle-allow-hod-view'),
    
    # API 7: Get Response Statistics (HOD)
    path('<int:form_id>/statistics/', GetResponseStatisticsView.as_view(), name='feedback-statistics'),
    
    # API 8: Get Response List (HOD)
    path('<int:form_id>/responses/', GetResponseListView.as_view(), name='feedback-responses'),
    
    # API: Export Form Responses to Excel (HOD)
    path('<int:form_id>/export-excel/', FormExportExcelView.as_view(), name='feedback-export-excel'),
    
    # API 9: Get Student Subjects for Subject Feedback
    path('<int:form_id>/subjects/', GetStudentSubjectsView.as_view(), name='feedback-subjects'),
    
    # API 10: Get Subjects by Year (HOD - for form creation)
    path('subjects-by-year/', GetSubjectsByYearView.as_view(), name='subjects-by-year'),
    
    # API 11: Delete Feedback Form (HOD)
    path('<int:form_id>/delete/', DeleteFeedbackFormView.as_view(), name='feedback-delete'),
    
    # Diagnostic API: Check ElectiveChoice records
    path('diagnostic/elective-choices/', DiagnosticElectiveChoicesView.as_view(), name='diagnostic-elective-choices'),
    
    # IQAC Common Export APIs
    path('common-export/options/', IQACExportOptionsView.as_view(), name='common-export-options'),
    path('export-years/', IQACExportYearsView.as_view(), name='export-years'),
    path('common-export/', IQACCommonExportView.as_view(), name='common-export'),
    path('non-responders-export/', NonRespondersExportView.as_view(), name='non-responders-export'),

    # Subject Wise Report API
    path('subject-wise-report/', SubjectWiseReportView.as_view(), name='subject-wise-report'),
    
    # Bulk Subject Wise Report API (with modal filters)
    path('bulk-subject-wise-report/', BulkSubjectWiseReportView.as_view(), name='bulk-subject-wise-report'),
    
    # Subjects Filter API (for dynamic subject dropdown)
    path('subjects-filter/', SubjectsFilterView.as_view(), name='subjects-filter'),

    # Principal integrated dashboard/analytics APIs
    path('principal/create/', PrincipalCreateFeedbackView.as_view(), name='principal-create'),
    path('principal/analytics-dashboard/', PrincipalAnalyticsDashboardView.as_view(), name='principal-analytics-dashboard'),
    path('principal/<int:form_id>/analytics/', PrincipalFormAnalyticsView.as_view(), name='principal-form-analytics'),
]
