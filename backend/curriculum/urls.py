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
    HodElectivePollStatusView,
    ElectivePollSubjectStatusView,
    ElectivePollSeatCountView,
    SubmitElectiveChoiceView,
    ElectivePollExportView,
    CurriculumColumnConfigViewSet,
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
router.register(r'column-configs', CurriculumColumnConfigViewSet, basename='curriculum-column-configs')

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
    path('elective-polls/seat-counts/', ElectivePollSeatCountView.as_view(), name='elective-polls-seat-counts'),
    path('elective-polls/hod-status/', HodElectivePollStatusView.as_view(), name='elective-polls-hod-status'),
    path('elective-polls/', ElectivePollView.as_view(), name='elective-polls'),
    path('elective-polls/<int:pk>/', ElectivePollDetailView.as_view(), name='elective-poll-detail'),
    path('elective-polls/<int:poll_id>/subjects/<int:subject_id>/', ElectivePollSubjectStatusView.as_view(), name='elective-poll-subject-status'),
    path('elective-polls/<int:pk>/submit/', SubmitElectiveChoiceView.as_view(), name='elective-poll-submit'),
    path('elective-polls/<int:pk>/export/', ElectivePollExportView.as_view(), name='elective-poll-export'),
    path('', include(router.urls)),
]
