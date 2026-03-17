from django.urls import path
from applications.views.inbox_views import ApproverInboxView, PastApprovalsView
from applications.views.application_views import (
    ApplicationApprovalHistoryView,
    ApplicationDetailView,
    ApplicationCancelView,
    MyApplicationsView,
    CreateAndSubmitView,
    ApplicationActionView,
    ApplicationStepInfoView,
)
from applications.views.types_views import ApplicationTypeListView, ApplicationTypeSchemaView
from applications.views.attachments_views import ApplicationAttachmentListCreateView, ApplicationAttachmentDeleteView
from applications.views.nav_views import ApplicationsNavView
from applications.views.admin_views import (
    ApplicationsAdminOverviewView,
    ApplicationsAdminRolesView,
    ApplicationsAdminTypeListCreateView,
    ApplicationsAdminTypeDetailView,
    ApplicationsAdminFieldListCreateView,
    ApplicationsAdminFieldDetailView,
    ApplicationsAdminFieldReorderView,
    ApplicationsAdminVersionListCreateView,
    ApplicationsAdminVersionActivateView,
    ApplicationsAdminFlowListCreateView,
    ApplicationsAdminFlowDetailView,
    ApplicationsAdminStepListCreateView,
    ApplicationsAdminStepDetailView,
    ApplicationsAdminRolePermissionsView,
    ApplicationsAdminSubmissionListView,
)

urlpatterns = [
    path('nav/', ApplicationsNavView.as_view(), name='applications-nav'),
    path('inbox/', ApproverInboxView.as_view(), name='approver-inbox'),
    path('past-approvals/', PastApprovalsView.as_view(), name='past-approvals'),
    path('types/', ApplicationTypeListView.as_view(), name='application-type-list'),
    path('types/<int:id>/schema/', ApplicationTypeSchemaView.as_view(), name='application-type-schema'),
    path('create-and-submit/', CreateAndSubmitView.as_view(), name='application-create-submit'),
    path('my/', MyApplicationsView.as_view(), name='my-applications'),
    path('<int:id>/', ApplicationDetailView.as_view(), name='application-detail'),
    path('<int:id>/cancel/', ApplicationCancelView.as_view(), name='application-cancel'),
    path('<int:id>/history/', ApplicationApprovalHistoryView.as_view(), name='application-approval-history'),
    path('<int:id>/step-info/', ApplicationStepInfoView.as_view(), name='application-step-info'),
    path('<int:id>/action/', ApplicationActionView.as_view(), name='application-action'),
    path('<int:id>/attachments/', ApplicationAttachmentListCreateView.as_view(), name='application-attachments-list-create'),
    path('admin/overview/', ApplicationsAdminOverviewView.as_view(), name='applications-admin-overview'),
    path('admin/roles/', ApplicationsAdminRolesView.as_view(), name='applications-admin-roles'),
    path('admin/types/', ApplicationsAdminTypeListCreateView.as_view(), name='applications-admin-types'),
    path('admin/types/<int:id>/', ApplicationsAdminTypeDetailView.as_view(), name='applications-admin-type-detail'),
    path('admin/types/<int:type_id>/fields/', ApplicationsAdminFieldListCreateView.as_view(), name='applications-admin-fields'),
    path('admin/types/<int:type_id>/fields/reorder/', ApplicationsAdminFieldReorderView.as_view(), name='applications-admin-fields-reorder'),
    path('admin/fields/<int:id>/', ApplicationsAdminFieldDetailView.as_view(), name='applications-admin-field-detail'),
    path('admin/types/<int:type_id>/versions/', ApplicationsAdminVersionListCreateView.as_view(), name='applications-admin-versions'),
    path('admin/versions/<int:id>/activate/', ApplicationsAdminVersionActivateView.as_view(), name='applications-admin-version-activate'),
    path('admin/types/<int:type_id>/flows/', ApplicationsAdminFlowListCreateView.as_view(), name='applications-admin-flows'),
    path('admin/flows/<int:id>/', ApplicationsAdminFlowDetailView.as_view(), name='applications-admin-flow-detail'),
    path('admin/flows/<int:flow_id>/steps/', ApplicationsAdminStepListCreateView.as_view(), name='applications-admin-steps'),
    path('admin/steps/<int:id>/', ApplicationsAdminStepDetailView.as_view(), name='applications-admin-step-detail'),
    path('admin/types/<int:type_id>/role-permissions/', ApplicationsAdminRolePermissionsView.as_view(), name='applications-admin-role-permissions'),
    path('admin/submissions/', ApplicationsAdminSubmissionListView.as_view(), name='applications-admin-submissions'),
]
