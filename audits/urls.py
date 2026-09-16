from django.urls import path

from .views import (
    AuditAssignmentAuditorRemoveView,
    AuditAssignmentDetailView,
    AuditAssignmentListView,
    AuditATRView,
    AuditConsolidatedView,
    AuditCycleListView,
    AuditDepartmentsView,
    AuditQuestionDetailView,
    AuditQuestionImportView,
    AuditQuestionListView,
    AuditQuestionSetDetailView,
    AuditQuestionSetInitDefaultView,
    AuditQuestionSetListView,
    AuditReportView,
    AuditRubricDetailView,
    AuditRubricDownloadView,
    AuditRubricListView,
    AuditScoreSaveView,
    AuditStaffView,
)

urlpatterns = [
    # Lookups (departments & faculty from staff roll)
    path('departments/', AuditDepartmentsView.as_view(), name='audit-departments'),
    path('staff/', AuditStaffView.as_view(), name='audit-staff'),

    # Questions
    path('questions/', AuditQuestionListView.as_view(), name='audit-questions'),
    path('questions/<int:pk>/', AuditQuestionDetailView.as_view(), name='audit-question-detail'),
    path('questions/import/', AuditQuestionImportView.as_view(), name='audit-questions-import'),

    # Question Sets (IQAC)
    path('question-sets/', AuditQuestionSetListView.as_view(), name='audit-question-sets'),
    path('question-sets/init-default/', AuditQuestionSetInitDefaultView.as_view(), name='audit-question-sets-init'),
    path('question-sets/<int:pk>/', AuditQuestionSetDetailView.as_view(), name='audit-question-set-detail'),

    # Audit Rubrics
    path('rubrics/', AuditRubricListView.as_view(), name='audit-rubrics'),
    path('rubrics/<int:pk>/', AuditRubricDetailView.as_view(), name='audit-rubric-detail'),
    path('rubrics/<int:pk>/download/', AuditRubricDownloadView.as_view(), name='audit-rubric-download'),

    # Cycles
    path('cycles/', AuditCycleListView.as_view(), name='audit-cycles'),

    # Assignments
    path('assignments/', AuditAssignmentListView.as_view(), name='audit-assignments'),
    path('assignments/<int:pk>/', AuditAssignmentDetailView.as_view(), name='audit-assignment-detail'),
    path('assignments/<int:pk>/auditors/<int:staff_id>/', AuditAssignmentAuditorRemoveView.as_view(), name='audit-assignment-auditor-remove'),
    path('assignments/<int:pk>/scores/', AuditScoreSaveView.as_view(), name='audit-score-save'),
    path('assignments/<int:pk>/report/', AuditReportView.as_view(), name='audit-report'),
    path('assignments/<int:pk>/atr/', AuditATRView.as_view(), name='audit-atr'),

    # Consolidated review (IQAC)
    path('consolidated/', AuditConsolidatedView.as_view(), name='audit-consolidated'),
]
