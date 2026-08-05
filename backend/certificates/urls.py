from django.urls import path

from .views import (
    AllAchievementsView,
    ApproveCertificateView,
    AdviseeAchievementsView,
    CertificateReportsExportView,
    CertificateReportsView,
    CertificateStatsView,
    CertificateUploadView,
    DepartmentAchievementsView,
    MenteeAchievementsView,
    MentorAchievementsView,
    MyCertificatesView,
    PendingReviewView,
    RejectCertificateView,
    StaffAchievementStatsView,
)

urlpatterns = [
    path('upload/', CertificateUploadView.as_view()),
    path('my-certificates/', MyCertificatesView.as_view()),
    path('pending-review/', PendingReviewView.as_view()),
    path('mentor-achievements/', MentorAchievementsView.as_view()),
    path('<int:pk>/approve/', ApproveCertificateView.as_view()),
    path('<int:pk>/reject/', RejectCertificateView.as_view()),
    path('mentee-achievements/<int:student_id>/', MenteeAchievementsView.as_view()),
    path('advisee-achievements/', AdviseeAchievementsView.as_view()),
    path('advisee-achievements/<int:student_id>/', AdviseeAchievementsView.as_view()),
    path('department-achievements/', DepartmentAchievementsView.as_view()),
    path('all-achievements/', AllAchievementsView.as_view()),
    path('stats/', CertificateStatsView.as_view()),
    path('reports/', CertificateReportsView.as_view()),
    path('reports/export/', CertificateReportsExportView.as_view()),
    path('staff-achievement-stats/<int:staff_id>/', StaffAchievementStatsView.as_view()),
]
