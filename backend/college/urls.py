from django.urls import path
from .views import (
    CollegeListCreateView,
    CollegeDetailView,
    CollegeUsersListView,
    CollegeUserImportTemplateView,
    CollegeUserImportView,
    CollegeUserDeleteView,
    CollegeFeaturesListView,
    CollegeFeatureToggleView,
    DepartmentListCreateView,
    DepartmentDetailView,
    BatchListCreateView,
    BatchDetailView,
    BatchBulkCreateView,
    BatchGroupView,
    RegulationListCreateView,
    RegulationDetailView,
    ProgramListCreateView,
    ProgramDetailView,
    CourseListCreateView,
    CourseDetailView,
    CourseListView,
    DepartmentHodView,
    search_colleges,
    list_all_colleges,
)

urlpatterns = [
    path('colleges/', CollegeListCreateView.as_view(), name='college-list-create'),
    path('colleges/<int:pk>/', CollegeDetailView.as_view(), name='college-detail'),
    path('colleges/<int:pk>/users/', CollegeUsersListView.as_view(), name='college-users-list'),
    path('colleges/<int:pk>/users/import-template/', CollegeUserImportTemplateView.as_view(), name='college-users-import-template'),
    path('colleges/<int:pk>/users/import/', CollegeUserImportView.as_view(), name='college-users-import'),
    path('colleges/<int:pk>/users/<int:user_id>/', CollegeUserDeleteView.as_view(), name='college-user-delete'),
    path('colleges/<int:pk>/features/', CollegeFeaturesListView.as_view(), name='college-features-list'),
    path('colleges/<int:pk>/features/<str:code>/', CollegeFeatureToggleView.as_view(), name='college-feature-toggle'),
    # Departments CRUD
    path('departments/', DepartmentListCreateView.as_view(), name='department-list-create'),
    path('departments/<int:pk>/', DepartmentDetailView.as_view(), name='department-detail'),
    path('departments/<int:dept_id>/roles/', DepartmentHodView.as_view(), name='department-roles'),
    # Batches CRUD
    path('batches/', BatchListCreateView.as_view(), name='batch-list-create'),
    path('batches/bulk/', BatchBulkCreateView.as_view(), name='batch-bulk-create'),
    path('batches/group/<str:name>/', BatchGroupView.as_view(), name='batch-group'),
    path('batches/<int:pk>/', BatchDetailView.as_view(), name='batch-detail'),
    # Regulations CRUD
    path('regulations/', RegulationListCreateView.as_view(), name='regulation-list-create'),
    path('regulations/<int:pk>/', RegulationDetailView.as_view(), name='regulation-detail'),
    # Programs CRUD
    path('programs/', ProgramListCreateView.as_view(), name='program-list-create'),
    path('programs/<int:pk>/', ProgramDetailView.as_view(), name='program-detail'),
    # Courses CRUD (Internal IDs)
    path('course-records/', CourseListCreateView.as_view(), name='course-records-list-create'),
    path('course-records/<int:pk>/', CourseDetailView.as_view(), name='course-records-detail'),
    # Lookup helpers
    path('courses/', CourseListView.as_view(), name='course-list'),
    # Public search endpoints
    path('search/', search_colleges, name='search_colleges'),
    path('list/', list_all_colleges, name='list_all_colleges'),
]
