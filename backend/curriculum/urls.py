from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CurriculumMasterViewSet, 
    CurriculumDepartmentViewSet, 
    ElectiveSubjectViewSet, 
    ElectiveChoicesView, 
    MasterImportView,
    ElectiveChoiceTemplateDownloadView,
    ElectiveChoiceBulkImportView
)

router = DefaultRouter()
router.register(r'master', CurriculumMasterViewSet, basename='curriculum-master')
router.register(r'department', CurriculumDepartmentViewSet, basename='curriculum-department')
router.register(r'elective', ElectiveSubjectViewSet, basename='curriculum-elective')

urlpatterns = [
    # Place the explicit import endpoint before the router so 'import' is not
    # interpreted as a ViewSet detail `pk` value (which would return 405 for POST).
    path('master/import/', MasterImportView.as_view(), name='curriculum-master-import'),
    path('elective-choices/template/', ElectiveChoiceTemplateDownloadView.as_view(), name='elective-choices-template'),
    path('elective-choices/import/', ElectiveChoiceBulkImportView.as_view(), name='elective-choices-import'),
    path('elective-choices/', ElectiveChoicesView.as_view(), name='elective-choices'),
    path('', include(router.urls)),
]
