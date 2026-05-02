from django.urls import path

from . import views


urlpatterns = [
    # ── v1 endpoints (existing, unchanged) ───────────────────────────────────
    path('marks/theory/',        views.theory_marks,       name='reporting_theory_marks'),
    path('marks/tcpr-tcpl/',     views.tcpr_tcpl_marks,    name='reporting_tcpr_tcpl_marks'),
    path('marks/project-lab/',   views.project_lab_marks,  name='reporting_project_lab_marks'),
    # Alias: some networks block hyphenated paths
    path('marks/project_lab/',   views.project_lab_marks,  name='reporting_project_lab_marks_alias'),

    # ── v2 endpoints — one row per student × course ───────────────────────────
    # API 1 · THEORY, PRBL, THEORY_PMBL
    path('v2/marks/theory/',      views.v2_theory_marks,      name='reporting_v2_theory_marks'),
    # API 2 · TCPR, TCPL
    path('v2/marks/tcpr-tcpl/',   views.v2_tcpr_tcpl_marks,   name='reporting_v2_tcpr_tcpl_marks'),
    # API 3 · PROJECT, LAB
    path('v2/marks/project-lab/', views.v2_project_lab_marks, name='reporting_v2_project_lab_marks'),
    # API 4 · PURE_LAB
    path('v2/marks/pure-lab/',    views.v2_pure_lab_marks,    name='reporting_v2_pure_lab_marks'),
    # API 5 · SPECIAL
    path('v2/marks/special/',     views.v2_special_marks,     name='reporting_v2_special_marks'),
]
