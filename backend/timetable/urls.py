from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TimetableTemplateViewSet, TimetableSlotViewSet, TimetableAssignmentViewSet, CurriculumBySectionView, SectionTimetableView, StaffTimetableView, SectionSubjectsStaffView
from .views import SpecialTimetableViewSet, SpecialTimetableEntryViewSet, PeriodSwapView
from .views import PeriodSwapRequestView, PeriodSwapRequestActionView, BulkSpecialTimetableEntryCreateView

router = DefaultRouter()
router.register('templates', TimetableTemplateViewSet, basename='timetable-template')
router.register('slots', TimetableSlotViewSet, basename='timetable-slot')
router.register('assignments', TimetableAssignmentViewSet, basename='timetable-assignment')
router.register('special-timetables', SpecialTimetableViewSet, basename='special-timetable')
router.register('special-entries', SpecialTimetableEntryViewSet, basename='special-timetable-entry')

urlpatterns = [
    path('', include(router.urls)),
    path('curriculum-for-section/', CurriculumBySectionView.as_view(), name='timetable-curriculum-for-section'),
    path('section/<int:section_id>/timetable/', SectionTimetableView.as_view(), name='timetable-section-timetable'),
    path('section/<int:section_id>/subjects-staff/', SectionSubjectsStaffView.as_view(), name='timetable-section-subjects-staff'),
    path('section/<int:section_id>/swap-periods/', PeriodSwapView.as_view(), name='timetable-section-swap-periods'),
    path('staff/', StaffTimetableView.as_view(), name='timetable-staff-timetable'),
    path('special-entries-bulk/', BulkSpecialTimetableEntryCreateView.as_view(), name='special-timetable-entry-bulk'),
    path('swap-requests/', PeriodSwapRequestView.as_view(), name='timetable-swap-requests'),
    path('swap-requests/<int:request_id>/<str:action>/', PeriodSwapRequestActionView.as_view(), name='timetable-swap-request-action'),
]
