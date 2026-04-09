from django.urls import path

from . import views


urlpatterns = [
    path('marks/theory/', views.theory_marks, name='reporting_theory_marks'),
    path('marks/tcpr-tcpl/', views.tcpr_tcpl_marks, name='reporting_tcpr_tcpl_marks'),
    path('marks/project-lab/', views.project_lab_marks, name='reporting_project_lab_marks'),
    # Alias path for clients/networks that intermittently block the hyphenated route.
    path('marks/project_lab/', views.project_lab_marks, name='reporting_project_lab_marks_alias'),
]
