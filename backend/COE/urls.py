from django.urls import path
from .views import (
    CoeArrearBulkUpsertView,
    CoeArrearStudentDetailView,
    CoeArrearStudentsView,
    CoePortalContextView,
    CoeStudentsCourseMapView,
)
from .assignments_views import CoeAssignmentStoreView
from .selection_views import CoeCourseSelectionView
from .kv_views import CoeKeyValueStoreView
from .views_save import CoeResetExamDummies, CoeSaveExamDummies
from .external_staff_views import ExternalStaffListView, AssignExternalCodesView, ExternalStaffDbMirrorView

urlpatterns = [
    path('portal/', CoePortalContextView.as_view(), name='coe_portal_context'),
    path('students-map/', CoeStudentsCourseMapView.as_view(), name='coe_students_course_map'),
    path('arrears/', CoeArrearStudentsView.as_view(), name='coe_arrear_students'),
    path('arrears/bulk-upsert/', CoeArrearBulkUpsertView.as_view(), name='coe_arrear_bulk_upsert'),
    path('arrears/<int:pk>/', CoeArrearStudentDetailView.as_view(), name='coe_arrear_student_detail'),
    path('save-dummies/', CoeSaveExamDummies.as_view(), name='coe_save_dummies'),
    path('reset-dummies/', CoeResetExamDummies.as_view(), name='coe_reset_dummies'),
    path('assignments/', CoeAssignmentStoreView.as_view(), name='coe_assignments'),
    path('course-selections/', CoeCourseSelectionView.as_view(), name='coe_course_selections'),
    path('kv-store/', CoeKeyValueStoreView.as_view(), name='coe_kv_store'),
    path('external-staff/', ExternalStaffListView.as_view(), name='coe_external_staff'),
    path('external-staff/db-mirror/', ExternalStaffDbMirrorView.as_view(), name='coe_external_staff_db_mirror'),
    path('external-staff/assign-codes/', AssignExternalCodesView.as_view(), name='coe_assign_external_codes'),
]
