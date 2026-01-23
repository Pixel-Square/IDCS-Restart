from django.urls import path, include
from django.contrib import admin

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounts/', include('accounts.urls')),
    # also expose the same endpoints under /api/auth/ for compatibility
    path('api/auth/', include('accounts.urls')),
]
