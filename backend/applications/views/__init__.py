# views package for applications
from .application_views import (
	CreateApplicationView,
	MyApplicationsView,
	PendingApplicationsView,
	ApplicationDetailView,
	ApplicationApproveView,
	ApplicationRejectView,
)

__all__ = [
	'CreateApplicationView',
	'MyApplicationsView',
	'PendingApplicationsView',
	'ApplicationDetailView',
	'ApplicationApproveView',
	'ApplicationRejectView',
]
