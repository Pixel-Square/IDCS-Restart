from django.contrib import admin
from .models import Announcement, AnnouncementCourse, AnnouncementRead


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'source', 'created_by', 'is_published', 'created_at')
    list_filter = ('source', 'is_published', 'created_at')
    search_fields = ('title', 'content', 'created_by__username')
    readonly_fields = ('id', 'created_at', 'updated_at', 'published_at')
    filter_horizontal = ('courses',)
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('created_by')


@admin.register(AnnouncementCourse)
class AnnouncementCourseAdmin(admin.ModelAdmin):
    list_display = ('announcement', 'course', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('announcement__title', 'course__code')
    readonly_fields = ('created_at',)


@admin.register(AnnouncementRead)
class AnnouncementReadAdmin(admin.ModelAdmin):
    list_display = ('announcement', 'user', 'read_at')
    list_filter = ('read_at',)
    search_fields = ('announcement__title', 'user__username')
    readonly_fields = ('read_at',)
