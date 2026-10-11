from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import (
    PBASApprovalFlowView,
    PBASApprovalsListView,
    PBASCollegeListView,
    PBASCustomDepartmentNodesView,
    PBASCustomDepartmentTreeView,
    PBASCustomDepartmentViewSet,
    PBASMenteesListView,
    PBASNodeApproversView,
    PBASStaffListView,
    PBASSubmissionActionView,
    PBASSubmissionCreateView,
    PBASSubmissionDocumentView,
    PBASSubmissionLogsView,
    PBASSubmissionMineView,
    PBASSubmissionReportView,
    PBASUserActivityDetailView,
    PBASUserActivityListView,
    PBASVerifierTicketForwardToDepartmentView,
    PBASVerifierTicketForwardToMentorView,
    PBASVerifierTicketsMyListView,
    PBASDurationViewSet,
)


router = SimpleRouter()
router.register(r'custom-departments', PBASCustomDepartmentViewSet, basename='pbas-custom-departments')
router.register(r'durations', PBASDurationViewSet, basename='pbas-durations')


urlpatterns = [
    path('', include(router.urls)),
    path('custom-departments/<str:dept_id>/tree/', PBASCustomDepartmentTreeView.as_view(), name='pbas-dept-tree'),
    path('custom-departments/<str:dept_id>/nodes/', PBASCustomDepartmentNodesView.as_view(), name='pbas-dept-nodes'),
    path('approval-flow/', PBASApprovalFlowView.as_view(), name='pbas-approval-flow'),
    path('mentees/', PBASMenteesListView.as_view(), name='pbas-mentees-list'),
    path('nodes/<uuid:node_id>/approvers/', PBASNodeApproversView.as_view(), name='pbas-node-approvers'),
    path('staff-list/', PBASStaffListView.as_view(), name='pbas-staff-list'),
    path('colleges/', PBASCollegeListView.as_view(), name='pbas-colleges'),
    path('activity/users/', PBASUserActivityListView.as_view(), name='pbas-user-activity-list'),
    path('activity/users/<int:user_id>/', PBASUserActivityDetailView.as_view(), name='pbas-user-activity-detail'),
    path('submissions/', PBASSubmissionCreateView.as_view(), name='pbas-submissions-create'),
    path('submissions/mine/', PBASSubmissionMineView.as_view(), name='pbas-submissions-mine'),
    path('submissions/approvals/', PBASApprovalsListView.as_view(), name='pbas-submissions-approvals'),
    path('submissions/logs/', PBASSubmissionLogsView.as_view(), name='pbas-submissions-logs'),
    path('submissions/<uuid:submission_id>/document/', PBASSubmissionDocumentView.as_view(), name='pbas-submission-document'),
    path('submissions/<uuid:submission_id>/action/', PBASSubmissionActionView.as_view(), name='pbas-submission-action'),
    path('submissions/<uuid:submission_id>/report/', PBASSubmissionReportView.as_view(), name='pbas-submission-report'),
    path('verifier-tickets/my/', PBASVerifierTicketsMyListView.as_view(), name='pbas-verifier-tickets-my'),
    path('verifier-tickets/<uuid:ticket_id>/forward-to-mentor/', PBASVerifierTicketForwardToMentorView.as_view(), name='pbas-ticket-forward-mentor'),
    path('verifier-tickets/<uuid:ticket_id>/forward-to-department/', PBASVerifierTicketForwardToDepartmentView.as_view(), name='pbas-ticket-forward-dept'),
]

