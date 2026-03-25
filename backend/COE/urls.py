from django.urls import path
from .views import (
    CoeArrearBulkUpsertView,
    CoeArrearStudentDetailView,
    CoeArrearStudentsView,
    CoePortalContextView,
    CoeStudentsCourseMapView,
)
from .views_save import CoeResetExamDummies, CoeSaveExamDummies

urlpatterns = [
    path('portal/', CoePortalContextView.as_view(), name='coe_portal_context'),
    path('students-map/', CoeStudentsCourseMapView.as_view(), name='coe_students_course_map'),
    path('arrears/', CoeArrearStudentsView.as_view(), name='coe_arrear_students'),
    path('arrears/bulk-upsert/', CoeArrearBulkUpsertView.as_view(), name='coe_arrear_bulk_upsert'),
    path('arrears/<int:pk>/', CoeArrearStudentDetailView.as_view(), name='coe_arrear_student_detail'),
    path('save-dummies/', CoeSaveExamDummies.as_view(), name='coe_save_dummies'),
    path('reset-dummies/', CoeResetExamDummies.as_view(), name='coe_reset_dummies'),
]
