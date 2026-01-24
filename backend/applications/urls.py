from django.urls import path
from applications.views.inbox_views import ApproverInboxView
from applications.views.application_views import ApplicationApprovalHistoryView
from applications.views.attachments_views import ApplicationAttachmentListCreateView, ApplicationAttachmentDeleteView

urlpatterns = [
    path('inbox/', ApproverInboxView.as_view(), name='approver-inbox'),
    path('<int:id>/history/', ApplicationApprovalHistoryView.as_view(), name='application-approval-history'),
    path('<int:id>/attachments/', ApplicationAttachmentListCreateView.as_view(), name='application-attachments-list-create'),
]
