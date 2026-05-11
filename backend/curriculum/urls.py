from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CurriculumMasterViewSet, 
    CurriculumDepartmentViewSet, 
    ElectiveSubjectViewSet, 
    ElectiveChoicesView, 
    MasterImportView,
    DepartmentGroupViewSet,
    CurriculumDepartmentsView,
    CurriculumPendingCountView,
    QuestionPaperTypeListView,
    ElectivePollView,
    ElectivePollDetailView,
    ActiveStudentPollsView,
    SubmitElectiveChoiceView,
    ElectivePollExportView,
)
from .elective_import_views import (
    ElectiveChoiceTemplateDownloadView,
    ElectiveChoiceBulkImportView,
    ElectivePollSubjectTemplateDownloadView
)

router = DefaultRouter()
router.register(r'master', CurriculumMasterViewSet, basename='curriculum-master')
router.register(r'department', CurriculumDepartmentViewSet, basename='curriculum-department')
router.register(r'elective', ElectiveSubjectViewSet, basename='curriculum-elective')
router.register(r'department-groups', DepartmentGroupViewSet, basename='curriculum-department-groups')

urlpatterns = [
    # Place the explicit import endpoint before the router so 'import' is not
    # interpreted as a ViewSet detail `pk` value (which would return 405 for POST).
    path('master/import/', MasterImportView.as_view(), name='curriculum-master-import'),
    path('elective-choices/template/', ElectiveChoiceTemplateDownloadView.as_view(), name='elective-choices-template'),
    path('elective-choices/import/', ElectiveChoiceBulkImportView.as_view(), name='elective-choices-import'),
    path('elective-polls/template/', ElectivePollSubjectTemplateDownloadView.as_view(), name='elective-polls-template'),
    path('elective-choices/', ElectiveChoicesView.as_view(), name='elective-choices'),
    path('departments/', CurriculumDepartmentsView.as_view(), name='curriculum-departments'),
    path('pending-count/', CurriculumPendingCountView.as_view(), name='curriculum-pending-count'),
    path('qp-types/', QuestionPaperTypeListView.as_view(), name='curriculum-qp-types'),
    path('elective-polls/active-for-student/', ActiveStudentPollsView.as_view(), name='elective-polls-active-student'),
    path('elective-polls/', ElectivePollView.as_view(), name='elective-polls'),
    path('elective-polls/<int:pk>/', ElectivePollDetailView.as_view(), name='elective-poll-detail'),
    path('elective-polls/<int:pk>/submit/', SubmitElectiveChoiceView.as_view(), name='elective-poll-submit'),
    path('elective-polls/<int:pk>/export/', ElectivePollExportView.as_view(), name='elective-poll-export'),
    path('', include(router.urls)),
]
