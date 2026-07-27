from backups_logs.registry import BackupSection
from .models import (
    AttendanceSettings,
    DepartmentAttendanceSettings,
    StaffAttendanceTimeLimitOverride,
    SpecialDepartmentDateAttendanceLimit,
    Holiday,
    AttendanceRecord,
    UploadLog,
    HalfDayRequest,
    StaffBiometricPunchLog,
)


class StaffAttendanceBackupSection(BackupSection):
    """
    Backup section for the Staff Attendance module.

    CONFIG: AttendanceSettings, DepartmentAttendanceSettings,
    StaffAttendanceTimeLimitOverride, SpecialDepartmentDateAttendanceLimit,
    Holiday. These define the rules and exceptions for attendance calculation.

    RAW: AttendanceRecord, UploadLog, HalfDayRequest, StaffBiometricPunchLog.
    These contain the actual daily tracking and device punch data.

    Restore strategy: wipe-and-replace. Deletion order respects FK dependencies.
    """
    section_id = "staff_attendance"
    display_name = "Staff Attendance"

    def get_raw_queryset_map(self):
        return {
            AttendanceSettings: AttendanceSettings.objects.all(),
            DepartmentAttendanceSettings: DepartmentAttendanceSettings.objects.all(),
            StaffAttendanceTimeLimitOverride: StaffAttendanceTimeLimitOverride.objects.all(),
            SpecialDepartmentDateAttendanceLimit: SpecialDepartmentDateAttendanceLimit.objects.all(),
            Holiday: Holiday.objects.all(),
            AttendanceRecord: AttendanceRecord.objects.all(),
            UploadLog: UploadLog.objects.all(),
            HalfDayRequest: HalfDayRequest.objects.all(),
            StaffBiometricPunchLog: StaffBiometricPunchLog.objects.all(),
        }

    def get_config_queryset_map(self):
        return {
            AttendanceSettings: AttendanceSettings.objects.all(),
            DepartmentAttendanceSettings: DepartmentAttendanceSettings.objects.all(),
            StaffAttendanceTimeLimitOverride: StaffAttendanceTimeLimitOverride.objects.all(),
            SpecialDepartmentDateAttendanceLimit: SpecialDepartmentDateAttendanceLimit.objects.all(),
            Holiday: Holiday.objects.all(),
        }

    def restore_raw(self, data):
        from django.core import serializers
        StaffBiometricPunchLog.objects.all().delete()
        HalfDayRequest.objects.all().delete()
        UploadLog.objects.all().delete()
        AttendanceRecord.objects.all().delete()
        Holiday.objects.all().delete()
        SpecialDepartmentDateAttendanceLimit.objects.all().delete()
        StaffAttendanceTimeLimitOverride.objects.all().delete()
        DepartmentAttendanceSettings.objects.all().delete()
        AttendanceSettings.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        from django.core import serializers
        deserialized = list(serializers.deserialize('json', data))

        imported_pks = {
            AttendanceSettings: set(),
            DepartmentAttendanceSettings: set(),
            StaffAttendanceTimeLimitOverride: set(),
            SpecialDepartmentDateAttendanceLimit: set(),
            Holiday: set(),
        }

        for des_obj in deserialized:
            model_class = des_obj.object.__class__
            if model_class in imported_pks:
                imported_pks[model_class].add(str(des_obj.object.pk))

        # Delete existing in reverse dep order
        for obj in Holiday.objects.all():
            if str(obj.pk) not in imported_pks[Holiday]:
                obj.delete()
        for obj in SpecialDepartmentDateAttendanceLimit.objects.all():
            if str(obj.pk) not in imported_pks[SpecialDepartmentDateAttendanceLimit]:
                obj.delete()
        for obj in StaffAttendanceTimeLimitOverride.objects.all():
            if str(obj.pk) not in imported_pks[StaffAttendanceTimeLimitOverride]:
                obj.delete()
        for obj in DepartmentAttendanceSettings.objects.all():
            if str(obj.pk) not in imported_pks[DepartmentAttendanceSettings]:
                obj.delete()
        for obj in AttendanceSettings.objects.all():
            if str(obj.pk) not in imported_pks[AttendanceSettings]:
                obj.delete()

        for des_obj in deserialized:
            des_obj.save()
