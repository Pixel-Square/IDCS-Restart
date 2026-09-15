from django.urls import path
from .views import (
    DisciplineApprovalFlowConfigView,
    DisciplineCategoriesView,
    DisciplineCategoryDetailView,
    DisciplineIncidentLogsView,
    DisciplineIncidentLogDetailView,
    DisciplineApprovalsListView,
    DisciplineFixFineView,
    DisciplineForwardActionView,
    DisciplineFinalApproveView,
    DisciplineStudentUploadReceiptView,
    DisciplineStudentIncidentsView,
    DisciplineStudentDirectoryView,
    DisciplineStudentExportExcelWithBarcodesView,
    DisciplineStudentExportBarcodeImagesZipView,
)

urlpatterns = [
    # Approval Flow Configuration API
    path('flow/', DisciplineApprovalFlowConfigView.as_view(), name='discipline-flow-config'),

    # Categories Config API
    path('categories/', DisciplineCategoriesView.as_view(), name='discipline-categories'),
    path('categories/<int:pk>/', DisciplineCategoryDetailView.as_view(), name='discipline-category-detail'),

    # Incident Logs API
    path('logs/', DisciplineIncidentLogsView.as_view(), name='discipline-logs'),
    path('logs/<int:pk>/', DisciplineIncidentLogDetailView.as_view(), name='discipline-log-detail'),

    # Staff Approvals List & Actions
    path('approvals/', DisciplineApprovalsListView.as_view(), name='discipline-approvals-list'),
    path('logs/<int:pk>/fix-fine/', DisciplineFixFineView.as_view(), name='discipline-log-fix-fine'),
    path('logs/<int:pk>/forward/', DisciplineForwardActionView.as_view(), name='discipline-log-forward'),
    path('logs/<int:pk>/approve/', DisciplineFinalApproveView.as_view(), name='discipline-log-approve'),
    path('logs/<int:pk>/upload-receipt/', DisciplineStudentUploadReceiptView.as_view(), name='discipline-student-upload-receipt'),

    # Student Portal: Pending vs Completed Actions
    path('student-my-incidents/', DisciplineStudentIncidentsView.as_view(), name='discipline-student-my-incidents'),

    # Real Student Directory with Barcode Data
    path('students/', DisciplineStudentDirectoryView.as_view(), name='discipline-students'),
    path('students/export-excel/', DisciplineStudentExportExcelWithBarcodesView.as_view(), name='discipline-students-export-excel'),
    path('students/export-zip/', DisciplineStudentExportBarcodeImagesZipView.as_view(), name='discipline-students-export-zip'),
]


