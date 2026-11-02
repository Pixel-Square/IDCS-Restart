from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import (
    PBASCustomDepartmentViewSet,
    PBASCustomDepartmentTreeView,
    PBASCustomDepartmentNodesView,
    PBASApprovalFlowView,
    PBASSubmissionCreateView,
    PBASSubmissionMineView,
    PBASApprovalsListView,
    PBASSubmissionActionView,
    PBASSubmissionDocumentView,
    PBASDurationViewSet,
    PBASSubmissionLogsView,
    PBASUserActivityListView,
    PBASUserActivityDetailView,
    PBASNodeApproversView,
    PBASStaffListView,
    PBASMenteesListView,
)

router = SimpleRouter()
router.register(r'custom-departments', PBASCustomDepartmentViewSet, basename='pbas-custom-departments')
router.register(r'durations', PBASDurationViewSet, basename='pbas-durations')

urlpatterns = [
    path('', include(router.urls)),
    path('custom-departments/<str:dept_id>/tree/', PBASCustomDepartmentTreeView.as_view(), name='pbas-dept-tree'),
    path('custom-departments/<str:dept_id>/nodes/', PBASCustomDepartmentNodesView.as_view(), name='pbas-dept-nodes'),
    path('approval-flow/', PBASApprovalFlowView.as_view(), name='pbas-approval-flow'),
    path('submissions/', PBASSubmissionCreateView.as_view(), name='pbas-submissions-create'),
    path('submissions/mine/', PBASSubmissionMineView.as_view(), name='pbas-submissions-mine'),
    path('submissions/approvals/', PBASApprovalsListView.as_view(), name='pbas-submissions-approvals'),
    path('submissions/<uuid:submission_id>/action/', PBASSubmissionActionView.as_view(), name='pbas-submission-action'),
    path('submissions/<uuid:submission_id>/document/', PBASSubmissionDocumentView.as_view(), name='pbas-submission-document'),
    path('submissions/logs/', PBASSubmissionLogsView.as_view(), name='pbas-submissions-logs'),
    path('activity/users/', PBASUserActivityListView.as_view(), name='pbas-user-activity-list'),
    path('activity/users/<int:user_id>/', PBASUserActivityDetailView.as_view(), name='pbas-user-activity-detail'),
    path('nodes/<uuid:node_id>/approvers/', PBASNodeApproversView.as_view(), name='pbas-node-approvers'),
    path('staff-list/', PBASStaffListView.as_view(), name='pbas-staff-list'),
    path('mentees/', PBASMenteesListView.as_view(), name='pbas-mentees'),
]
