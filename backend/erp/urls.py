from django.urls import path, include
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
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
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
