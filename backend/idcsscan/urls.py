from django.urls import path
from idcsscan.views import (
    LookupByUIDView, SearchStudentsView, AssignUIDView, UnassignUIDView, GatepassCheckView,
    SearchStaffView, AssignStaffUIDView, UnassignStaffUIDView, LookupAnyView, PingView,
    CardsDataView,
    ManageGatesView,
    ManageGateDetailView,
    ManageSecurityUsersView,
    ManageSecurityUserDetailView,
    RFReaderScanExportCsvView,
    GatepassLogsView,
    GatepassOfflineSecurityUsersView,
    GatepassOfflineRecordsView,
    GatepassOfflineUploadView,
    GatepassOfflinePullView,
    GatepassOfflineIgnoreView,
    GatepassOfflinePullAllView,
    GatepassOfflineIgnoreAllView,
)

urlpatterns = [
    path('ping/',                PingView.as_view(),               name='idscan-ping'),
    path('lookup/',              LookupByUIDView.as_view(),        name='idscan-lookup'),
    path('lookup-any/',          LookupAnyView.as_view(),          name='idscan-lookup-any'),
    path('search/',              SearchStudentsView.as_view(),      name='idscan-search'),
    path('assign-uid/',          AssignUIDView.as_view(),           name='idscan-assign-uid'),
    path('unassign-uid/',        UnassignUIDView.as_view(),         name='idscan-unassign-uid'),
    path('gatepass-check/',      GatepassCheckView.as_view(),       name='idscan-gatepass-check'),
    path('search-staff/',        SearchStaffView.as_view(),         name='idscan-search-staff'),
    path('assign-staff-uid/',    AssignStaffUIDView.as_view(),      name='idscan-assign-staff-uid'),
    path('unassign-staff-uid/',  UnassignStaffUIDView.as_view(),    name='idscan-unassign-staff-uid'),
    path('cards-data/',          CardsDataView.as_view(),          name='idscan-cards-data'),

    # HR/SECURITY: Manage Gate
    path('manage-gates/',        ManageGatesView.as_view(),        name='idscan-manage-gates'),
    path('manage-gates/<int:pk>/', ManageGateDetailView.as_view(), name='idscan-manage-gates-detail'),
    path('manage-security-users/', ManageSecurityUsersView.as_view(), name='idscan-manage-security-users'),
    path('manage-security-users/<int:pk>/', ManageSecurityUserDetailView.as_view(), name='idscan-manage-security-users-detail'),
    path('gatepass-logs/', GatepassLogsView.as_view(), name='idscan-gatepass-logs'),

    # HR: Offline gatepass records reconciliation
    path('gatepass-offline/security-users/', GatepassOfflineSecurityUsersView.as_view(), name='idscan-gatepass-offline-security-users'),
    path('gatepass-offline/', GatepassOfflineRecordsView.as_view(), name='idscan-gatepass-offline-records'),
    path('gatepass-offline/upload/', GatepassOfflineUploadView.as_view(), name='idscan-gatepass-offline-upload'),
    path('gatepass-offline/<int:pk>/pull/', GatepassOfflinePullView.as_view(), name='idscan-gatepass-offline-pull'),
    path('gatepass-offline/<int:pk>/ignore/', GatepassOfflineIgnoreView.as_view(), name='idscan-gatepass-offline-ignore'),
    path('gatepass-offline/pull-all/', GatepassOfflinePullAllView.as_view(), name='idscan-gatepass-offline-pull-all'),
    path('gatepass-offline/ignore-all/', GatepassOfflineIgnoreAllView.as_view(), name='idscan-gatepass-offline-ignore-all'),
    path('rfreader/scans/export.csv', RFReaderScanExportCsvView.as_view(), name='idscan-rfreader-scans-export-csv'),
]
