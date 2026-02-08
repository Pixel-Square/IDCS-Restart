from django.contrib import admin
from .models import College


@admin.register(College)
class CollegeAdmin(admin.ModelAdmin):
    list_display = ('code', 'short_name', 'name', 'city', 'is_active')
    search_fields = ('code', 'short_name', 'name', 'city')
    list_filter = ('is_active', 'city')
