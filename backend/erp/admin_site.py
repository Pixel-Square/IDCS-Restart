"""
Custom Django AdminSite that hides all college-scoped tenant apps from the
global admin index. These apps are only accessible through the College
dashboard (college/admin.py → college_dashboard_view).

Global (always visible) apps:
  - college  → the super-app containing all college management
  - accounts → users, roles, permissions
  - auth     → Django auth groups (django.contrib.auth)
  - admin    → django log entries
  - contenttypes

Tenant (college-scoped, hidden from index) apps:
  - academics, OBE, curriculum, feedback, staff_requests, staff_attendance,
    staff_salary, timetable, lms, COE, applications, certificates,
    announcements, academic_calendar, idcsscan, pbas, question_bank,
    template_api, reporting, data_import, timetable, lms
"""

from django.contrib.admin import AdminSite


# App labels that should ONLY be accessible through the College Dashboard,
# not via the top-level admin index.
TENANT_APP_LABELS = frozenset([
    'academics',
    'OBE',
    'curriculum',
    'feedback',
    'staff_requests',
    'staff_attendance',
    'staff_salary',
    'timetable',
    'lms',
    'COE',
    'applications',
    'certificates',
    'announcements',
    'academic_calendar',
    'idcsscan',
    'pbas',
    'question_bank',
    'template_api',
    'reporting',
    'data_import',
    'django_celery_results',
])


class CollegeScopedAdminSite(AdminSite):
    """
    Custom admin site that removes all tenant (college-scoped) apps from the
    main admin index page. Models from those apps are still registered and
    their changelist/change-form URLs work normally — they are just navigated
    to exclusively through the College Dashboard view.
    """

    # ------------------------------------------------------------------ #
    # Override get_app_list to strip out TENANT_APP_LABELS from the index #
    # ------------------------------------------------------------------ #

    def get_app_list(self, request, app_label=None):
        """
        Return a sorted list of app dicts for the admin index, excluding all
        college-scoped tenant apps.
        """
        app_list = super().get_app_list(request, app_label=app_label)
        # When called with a specific app_label (e.g. from app_index view),
        # don't strip — just return as-is (the individual app pages still work).
        if app_label is not None:
            return app_list
        # Strip tenant apps from the index.
        return [
            app for app in app_list
            if app['app_label'] not in TENANT_APP_LABELS
        ]

    def index(self, request, extra_context=None):
        from college.models import College
        extra_context = extra_context or {}
        # Fetch active colleges to display as tabs on the dashboard
        extra_context['colleges'] = College.objects.filter(is_active=True).order_by('name')
        return super().index(request, extra_context=extra_context)
