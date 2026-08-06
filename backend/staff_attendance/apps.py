from django.apps import AppConfig


class StaffAttendanceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'staff_attendance'
    verbose_name = 'Staff Attendance'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import StaffAttendanceBackupSection
        section_registry.register(StaffAttendanceBackupSection())
