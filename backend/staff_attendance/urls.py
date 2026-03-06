from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AttendanceRecordViewSet, UploadLogViewSet, CSVUploadViewSet, HalfDayRequestViewSet, HolidayViewSet

router = DefaultRouter()
router.register(r'records', AttendanceRecordViewSet, basename='attendance-record')
router.register(r'upload-logs', UploadLogViewSet, basename='upload-log')
router.register(r'csv-upload', CSVUploadViewSet, basename='csv-upload')
router.register(r'halfday-requests', HalfDayRequestViewSet, basename='halfday-request')
router.register(r'holidays', HolidayViewSet, basename='holiday')

urlpatterns = [
    path('', include(router.urls)),
]
