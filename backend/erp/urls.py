from django.urls import path, include, re_path
from django.contrib import admin
from django.conf import settings
from django.views.static import serve as _serve
import sys
import erp.admin_customization
from erp import admin_views
from django.conf.urls.static import static
from django.http import HttpResponse
from django.shortcuts import render


def welcome(request):
    return render(request, 'welcome.html', {})

urlpatterns = [
    path('', welcome, name='welcome'),
    path('favicon.ico', lambda request: HttpResponse(status=204), name='favicon'),
    # path('grappelli/', include('grappelli.urls')),
    path('admin/', admin.site.urls),
    path('api/accounts/', include('accounts.urls')),
    # also expose the same endpoints under /api/auth/ for compatibility
    path('api/auth/', include('accounts.urls')),
    path('api/academics/', include('academics.urls')),
    path('api/applications/', include('applications.urls')),
    path('api/attachments/', include('applications.attachments_urls')),
    path('api/curriculum/', include('curriculum.urls')),
    path('api/obe/', include('OBE.urls')),
    path('api/template/', include('template_api.urls')),
    path('api/canva/',    include('template_api.canva_urls')),
    path('api/import/', include('question_bank.urls')),
    path('api/timetable/', include('timetable.urls')),
    path('api/academic-calendar/', include('academic_calendar.api_urls')),
    path('api/pbas/', include('pbas.urls')),
    path('api/staff-attendance/', include('staff_attendance.urls')),
    # Staff Requests API (dynamic forms & workflow engine)
    path('api/staff-requests/', include('staff_requests.urls')),
    path('api/staff-salary/', include('staff_salary.urls')),
    path('api/idscan/', include('idcsscan.urls')),
    path('api/feedback/', include('feedback.urls')),
    path('api/announcements/', include('announcements.api_urls')),
]

# Admin dashboard data endpoint (counts for models) - always available
urlpatterns += [
    path('admin/dashboard-data/', admin_views.admin_counts, name='admin-dashboard-data'),
    path('admin/rfid-login/', admin_views.rfid_admin_login, name='admin-rfid-login'),
]

# Serve media files for local/dev environments, including non-runserver
# modes on localhost where nginx may not be configured.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# During development using `manage.py runserver` we serve media and project
# static files directly so the admin CSS and our logo are available even if
# DEBUG is not toggled via env vars. This is a convenience for local work only.
if 'runserver' in sys.argv or settings.DEBUG:
    # Serve uploaded media during local runserver even when DEBUG is disabled.
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', _serve, {'document_root': settings.MEDIA_ROOT}),
    ]

    # Serve project static files (from backend/static) when not using collectstatic
    urlpatterns += [
        re_path(r'^static/(?P<path>.*)$', _serve, {'document_root': settings.BASE_DIR / 'static'}),
    ]

    # Admin dashboard data endpoint (counts for models)
    urlpatterns += [
        path('admin/dashboard-data/', admin_views.admin_counts, name='admin-dashboard-data'),
    ]
