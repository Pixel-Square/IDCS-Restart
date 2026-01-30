from django.urls import path, include
from django.contrib import admin

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounts/', include('accounts.urls')),
    # also expose the same endpoints under /api/auth/ for compatibility
    path('api/auth/', include('accounts.urls')),
    path('api/academics/', include('academics.urls')),
    path('api/applications/', include('applications.urls')),
    path('api/attachments/', include('applications.attachments_urls')),
<<<<<<< HEAD
    path('api/curriculum/', include('curriculum.urls')),
=======

    path('api/obe/', include('OBE.urls')),
>>>>>>> origin/rohit
]
