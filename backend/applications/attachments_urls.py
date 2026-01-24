from django.urls import path
from applications.views.attachments_views import ApplicationAttachmentDeleteView

urlpatterns = [
    path('<int:id>/', ApplicationAttachmentDeleteView.as_view(), name='application-attachment-delete'),
]
