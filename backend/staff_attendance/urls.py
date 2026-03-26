from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AttendanceRecordViewSet, UploadLogViewSet, CSVUploadViewSet, HalfDayRequestViewSet, HolidayViewSet, AttendanceSettingsViewSet, DepartmentAttendanceSettingsViewSet, SpecialDepartmentDateAttendanceLimitViewSet, StaffAttendanceTimeLimitOverrideViewSet
from .realtime_views import BiometricRealtimeIngestView

router = DefaultRouter()
router.register(r'records', AttendanceRecordViewSet, basename='attendance-record')
router.register(r'upload-logs', UploadLogViewSet, basename='upload-log')
router.register(r'csv-upload', CSVUploadViewSet, basename='csv-upload')
router.register(r'half-day-requests', HalfDayRequestViewSet, basename='half-day-request')
router.register(r'holidays', HolidayViewSet, basename='holiday')
router.register(r'settings', AttendanceSettingsViewSet, basename='attendance-settings')
router.register(r'department-settings', DepartmentAttendanceSettingsViewSet, basename='department-attendance-settings')
router.register(r'special-department-date-limits', SpecialDepartmentDateAttendanceLimitViewSet, basename='special-department-date-limits')
router.register(r'staff-time-limits', StaffAttendanceTimeLimitOverrideViewSet, basename='staff-time-limits')

urlpatterns = [
    path('', include(router.urls)),
    path('biometric/realtime/', BiometricRealtimeIngestView.as_view(), name='biometric-realtime-ingest'),
]
