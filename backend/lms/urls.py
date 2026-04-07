from django.urls import path

from lms import views


urlpatterns = [
    path('materials/my/', views.StaffMaterialListCreateView.as_view()),
    path('materials/my/upload-options/', views.StaffUploadOptionsView.as_view()),
    path('materials/my/<int:pk>/', views.StaffMaterialDetailView.as_view()),
    path('materials/<int:pk>/download/', views.StudyMaterialDownloadView.as_view()),
    path('materials/<int:pk>/office-preview-url/', views.StudyMaterialOfficePreviewUrlView.as_view()),
    path('materials/office-preview/<str:token>/', views.StudyMaterialOfficePreviewFileView.as_view(), name='lms-office-preview-file'),
    path('materials/student/course-wise/', views.StudentCourseWiseMaterialsView.as_view()),
    path('materials/hod/course-wise/', views.HODCourseWiseMaterialsView.as_view()),
    path('materials/iqac/course-wise/', views.IQACCourseWiseMaterialsView.as_view()),
    path('audit/downloads/', views.DownloadAuditLogsView.as_view()),
    path('quota/me/', views.MyQuotaView.as_view()),
    path('quota/staff/', views.IQACQuotaListUpdateView.as_view()),
]
