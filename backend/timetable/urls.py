from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TimetableTemplateViewSet, TimetableSlotViewSet, TimetableAssignmentViewSet, CurriculumBySectionView, SectionTimetableView, StaffTimetableView, SectionSubjectsStaffView

router = DefaultRouter()
router.register('templates', TimetableTemplateViewSet, basename='timetable-template')
router.register('slots', TimetableSlotViewSet, basename='timetable-slot')
router.register('assignments', TimetableAssignmentViewSet, basename='timetable-assignment')

urlpatterns = [
    path('', include(router.urls)),
    path('curriculum-for-section/', CurriculumBySectionView.as_view(), name='timetable-curriculum-for-section'),
    path('section/<int:section_id>/timetable/', SectionTimetableView.as_view(), name='timetable-section-timetable'),
    path('section/<int:section_id>/subjects-staff/', SectionSubjectsStaffView.as_view(), name='timetable-section-subjects-staff'),
    path('staff/', StaffTimetableView.as_view(), name='timetable-staff-timetable'),
]
