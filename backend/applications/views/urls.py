from django.urls import path
from .application_views import (
    CreateApplicationView,
    MyApplicationsView,
    PendingApplicationsView,
    ApplicationDetailView,
    ApplicationApproveView,
    ApplicationRejectView,
)

urlpatterns = [
    path('api/applications/', CreateApplicationView.as_view(), name='applications-create'),
    path('api/applications/my/', MyApplicationsView.as_view(), name='applications-my'),
    path('api/applications/pending/', PendingApplicationsView.as_view(), name='applications-pending'),
    path('api/applications/<int:id>/', ApplicationDetailView.as_view(), name='applications-detail'),
    path('api/applications/<int:id>/approve/', ApplicationApproveView.as_view(), name='applications-approve'),
    path('api/applications/<int:id>/reject/', ApplicationRejectView.as_view(), name='applications-reject'),
]
