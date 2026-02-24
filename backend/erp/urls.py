from django.urls import path, include, re_path
from django.contrib import admin
from django.conf import settings
from django.views.static import serve as _serve
import sys
import erp.admin_customization
from erp import admin_views
from django.conf.urls.static import static
from django.views.generic import RedirectView
from django.http import HttpResponse

urlpatterns = [
    path('', RedirectView.as_view(url='/admin/', permanent=False), name='db-dashboard'),
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
    path('api/import/', include('question_bank.urls')),
    path('api/timetable/', include('timetable.urls')),
]

# Admin dashboard data endpoint (counts for models) - always available
urlpatterns += [
    path('admin/dashboard-data/', admin_views.admin_counts, name='admin-dashboard-data'),
]

# During development using `manage.py runserver` we serve media and project
# static files directly so the admin CSS and our logo are available even if
# DEBUG is not toggled via env vars. This is a convenience for local work only.
if 'runserver' in sys.argv or settings.DEBUG:
    # Serve media
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    # Serve project static files (from backend/static) when not using collectstatic
    urlpatterns += [
        re_path(r'^static/(?P<path>.*)$', _serve, {'document_root': settings.BASE_DIR / 'static'}),
    ]

    # Admin dashboard data endpoint (counts for models)
    urlpatterns += [
        path('admin/dashboard-data/', admin_views.admin_counts, name='admin-dashboard-data'),
    ]
