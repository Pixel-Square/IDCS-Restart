from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AllocationViewSet,
    AnnouncementViewSet,
    AssetMaintenanceViewSet,
    AssetViewSet,
    AuditLogView,
    BedViewSet,
    BuildingViewSet,
    CollegeBusViewSet,
    ComplaintReportView,
    ComplaintViewSet,
    DashboardView,
    FacilityChangeRequestViewSet,
    FacilityHistoryView,
    FacilitySelectionWindowViewSet,
    FeePaymentViewSet,
    FeeReportView,
    FeeStructureViewSet,
    FloorViewSet,
    GatePassViewSet,
    HostelConfigView,
    HostelNoticeViewSet,
    LateEntryViewSet,
    LeaveRequestViewSet,
    LookupView,
    MealBookingViewSet,
    MessFeedbackViewSet,
    MessMenuViewSet,
    MessRequestViewSet,
    MyAllocationView,
    MyAnnouncementsView,
    MyComplaintsView,
    MyFacilityView,
    MyFeesView,
    MyGatePassCancelView,
    MyGatePassesView,
    MyHostelOverviewView,
    MyLeavesView,
    MyMealBookingsView,
    MyMessFeedbackView,
    MyMessMenuView,
    MyMessPreferenceView,
    MyMessRequestsView,
    MyNoticesView,
    MyTransportView,
    MyVacatingView,
    MyVisitorsView,
    OccupancyReportView,
    RoomViewSet,
    StudentBulkImportView,
    StudentDetailView,
    StudentDirectoryView,
    StudentFacilityUpdateView,
    StudentFeeViewSet,
    StudentSyncRunsView,
    TransportAssignmentViewSet,
    TransportReportView,
    TransportRouteViewSet,
    TransportStopViewSet,
    VacatingRequestViewSet,
    VisitorViewSet,
    WardenAssignmentViewSet,
)

router = DefaultRouter()
router.register('buildings', BuildingViewSet, basename='hostel-building')
router.register('floors', FloorViewSet, basename='hostel-floor')
router.register('rooms', RoomViewSet, basename='hostel-room')
router.register('beds', BedViewSet, basename='hostel-bed')
router.register('wardens', WardenAssignmentViewSet, basename='hostel-warden')
router.register('allocations', AllocationViewSet, basename='hostel-allocation')
router.register('facility-requests', FacilityChangeRequestViewSet, basename='hostel-facility-request')
router.register('selection-windows', FacilitySelectionWindowViewSet, basename='hostel-selection-window')

router.register('routes', TransportRouteViewSet, basename='hostel-transport-route')
router.register('stops', TransportStopViewSet, basename='hostel-transport-stop')
router.register('buses', CollegeBusViewSet, basename='hostel-bus')
router.register('transport-assignments', TransportAssignmentViewSet, basename='hostel-transport-assignment')

router.register('fee-structures', FeeStructureViewSet, basename='hostel-fee-structure')
router.register('student-fees', StudentFeeViewSet, basename='hostel-student-fee')
router.register('payments', FeePaymentViewSet, basename='hostel-fee-payment')

router.register('complaints', ComplaintViewSet, basename='hostel-complaint')
router.register('mess-menus', MessMenuViewSet, basename='hostel-mess-menu')
router.register('meal-bookings', MealBookingViewSet, basename='hostel-meal-booking')
router.register('mess-feedback', MessFeedbackViewSet, basename='hostel-mess-feedback')
router.register('mess-requests', MessRequestViewSet, basename='hostel-mess-request')

router.register('visitors', VisitorViewSet, basename='hostel-visitor')
router.register('leave-requests', LeaveRequestViewSet, basename='hostel-leave-request')
router.register('gate-passes', GatePassViewSet, basename='hostel-gate-pass')
router.register('late-entries', LateEntryViewSet, basename='hostel-late-entry')

router.register('assets', AssetViewSet, basename='hostel-asset')
router.register('asset-maintenance', AssetMaintenanceViewSet, basename='hostel-asset-maintenance')

router.register('notices', HostelNoticeViewSet, basename='hostel-notice')
router.register('announcements', AnnouncementViewSet, basename='hostel-announcement')
router.register('vacating-requests', VacatingRequestViewSet, basename='hostel-vacating-request')

urlpatterns = [
    # ---- Student self-service (hostel portal) ----
    path('me/facility/', MyFacilityView.as_view(), name='hostel-me-facility'),
    path('me/overview/', MyHostelOverviewView.as_view(), name='hostel-me-overview'),
    path('me/allocation/', MyAllocationView.as_view(), name='hostel-me-allocation'),
    path('me/fees/', MyFeesView.as_view(), name='hostel-me-fees'),
    path('me/complaints/', MyComplaintsView.as_view(), name='hostel-me-complaints'),
    path('me/mess/menu/', MyMessMenuView.as_view(), name='hostel-me-mess-menu'),
    path('me/mess/feedback/', MyMessFeedbackView.as_view(), name='hostel-me-mess-feedback'),
    path('me/mess/preference/', MyMessPreferenceView.as_view(), name='hostel-me-mess-preference'),
    path('me/mess/bookings/', MyMealBookingsView.as_view(), name='hostel-me-meal-bookings'),
    path('me/mess/requests/', MyMessRequestsView.as_view(), name='hostel-me-mess-requests'),
    path('me/leaves/', MyLeavesView.as_view(), name='hostel-me-leaves'),
    path('me/gate-passes/', MyGatePassesView.as_view(), name='hostel-me-gate-passes'),
    path('me/gate-passes/<int:pk>/cancel/', MyGatePassCancelView.as_view(), name='hostel-me-gate-pass-cancel'),
    path('me/visitors/', MyVisitorsView.as_view(), name='hostel-me-visitors'),
    path('me/transport/', MyTransportView.as_view(), name='hostel-me-transport'),
    path('me/notices/', MyNoticesView.as_view(), name='hostel-me-notices'),
    path('me/announcements/', MyAnnouncementsView.as_view(), name='hostel-me-announcements'),
    path('me/vacating/', MyVacatingView.as_view(), name='hostel-me-vacating'),

    # ---- Administration ----
    path('config/', HostelConfigView.as_view(), name='hostel-config'),
    path('dashboard/', DashboardView.as_view(), name='hostel-dashboard'),
    path('lookups/', LookupView.as_view(), name='hostel-lookups'),

    path('students/', StudentDirectoryView.as_view(), name='hostel-students'),
    path('students/import/', StudentBulkImportView.as_view(), name='hostel-students-import'),
    path('students/sync-runs/', StudentSyncRunsView.as_view(), name='hostel-students-sync-runs'),
    path('students/<str:reg_no>/', StudentDetailView.as_view(), name='hostel-student-detail'),
    path('students/<str:reg_no>/facility/', StudentFacilityUpdateView.as_view(), name='hostel-student-facility'),

    path('facility-history/', FacilityHistoryView.as_view(), name='hostel-facility-history'),

    path('reports/occupancy/', OccupancyReportView.as_view(), name='hostel-report-occupancy'),
    path('reports/fees/', FeeReportView.as_view(), name='hostel-report-fees'),
    path('reports/transport/', TransportReportView.as_view(), name='hostel-report-transport'),
    path('reports/complaints/', ComplaintReportView.as_view(), name='hostel-report-complaints'),

    path('audit-log/', AuditLogView.as_view(), name='hostel-audit-log'),

    # ---- ViewSets ----
    path('', include(router.urls)),
]
