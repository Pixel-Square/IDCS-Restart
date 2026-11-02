from django.contrib import admin

from .models import (
    Asset,
    AssetMaintenanceLog,
    Bed,
    Building,
    ClearanceRecord,
    CollegeBus,
    Complaint,
    ComplaintStatusHistory,
    FacilityChangeRequest,
    FacilityHistory,
    FacilitySelectionWindow,
    FeePayment,
    FeeStructure,
    Floor,
    HostelAuditLog,
    HostelConfiguration,
    HostelNotice,
    HostelWardenAssignment,
    LateEntry,
    MessFeedback,
    MessMenu,
    MessPreference,
    MessRequest,
    Room,
    RoomAllocation,
    StudentFacilityProfile,
    StudentFee,
    StudentLeaveRequest,
    StudentSyncRun,
    TransportAssignment,
    TransportRoute,
    TransportStop,
    VacatingRequest,
    Visitor,
)


class AuditAdminMixin(admin.ModelAdmin):
    """Read-only admin for high-volume operational tables."""

    def has_add_permission(self, request):  # pragma: no cover - admin convenience
        return False

    def has_change_permission(self, request, obj=None):  # pragma: no cover
        return False

    def has_delete_permission(self, request, obj=None):  # pragma: no cover
        return False


@admin.register(Building)
class BuildingAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'building_type', 'hostel_category', 'planned_floors', 'status')
    list_filter = ('building_type', 'hostel_category', 'status')
    search_fields = ('code', 'name')


@admin.register(Floor)
class FloorAdmin(admin.ModelAdmin):
    list_display = ('building', 'floor_number', 'name', 'status', 'is_available_for_allocation')
    list_filter = ('status', 'building')
    search_fields = ('building__code', 'building__name', 'name')


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('room_number', 'building', 'floor', 'room_type', 'room_purpose', 'hostel_category', 'capacity', 'occupied_count', 'status')
    list_filter = ('room_purpose', 'room_type', 'hostel_category', 'status', 'building')
    search_fields = ('room_number', 'building__name', 'building__code')


@admin.register(HostelWardenAssignment)
class HostelWardenAssignmentAdmin(admin.ModelAdmin):
    list_display = ('building', 'user', 'designation', 'is_active', 'start_date', 'end_date')
    list_filter = ('designation', 'is_active', 'building')
    search_fields = ('building__name', 'user__email', 'user__username')


@admin.register(StudentFacilityProfile)
class StudentFacilityProfileAdmin(admin.ModelAdmin):
    list_display = ('student', 'residence_category', 'uses_college_bus', 'status', 'profile_verified', 'updated_at')
    list_filter = ('residence_category', 'status', 'profile_verified', 'uses_college_bus')
    search_fields = ('student__reg_no', 'student__user__email', 'student__user__first_name')
    raw_id_fields = ('student',)


@admin.register(FacilityChangeRequest)
class FacilityChangeRequestAdmin(admin.ModelAdmin):
    list_display = ('student', 'previous_category', 'requested_category', 'status', 'created_at', 'reviewed_by')
    list_filter = ('status', 'requested_category')
    search_fields = ('student__reg_no',)


@admin.register(RoomAllocation)
class RoomAllocationAdmin(admin.ModelAdmin):
    list_display = ('student', 'room', 'bed', 'start_date', 'end_date', 'status')
    list_filter = ('status', 'room__building')
    search_fields = ('student__reg_no', 'room__room_number')
    raw_id_fields = ('student', 'room', 'bed')


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ('ticket_no', 'student', 'category', 'priority', 'status', 'assigned_to', 'created_at')
    list_filter = ('category', 'priority', 'status')
    search_fields = ('ticket_no', 'subject', 'student__reg_no')


@admin.register(StudentFee)
class StudentFeeAdmin(admin.ModelAdmin):
    list_display = ('student', 'fee_structure', 'amount_due', 'amount_paid', 'status', 'due_date')
    list_filter = ('status', 'fee_structure__fee_type')
    search_fields = ('student__reg_no',)


@admin.register(HostelNotice)
class HostelNoticeAdmin(admin.ModelAdmin):
    list_display = ('title', 'notice_type', 'audience', 'is_emergency', 'published_at', 'is_active')
    list_filter = ('notice_type', 'audience', 'is_emergency', 'is_active')
    search_fields = ('title', 'body')


admin.site.register(HostelConfiguration)
admin.site.register(FacilitySelectionWindow)
admin.site.register(FacilityHistory)
admin.site.register(TransportRoute)
admin.site.register(TransportStop)
admin.site.register(CollegeBus)
admin.site.register(TransportAssignment)
admin.site.register(FeeStructure)
admin.site.register(FeePayment)
admin.site.register(ComplaintStatusHistory, AuditAdminMixin)
admin.site.register(MessMenu)
admin.site.register(MessPreference)
admin.site.register(MessFeedback)
admin.site.register(MessRequest)
admin.site.register(Visitor)
admin.site.register(StudentLeaveRequest)
admin.site.register(LateEntry)
admin.site.register(Asset)
admin.site.register(AssetMaintenanceLog)
admin.site.register(VacatingRequest)
admin.site.register(ClearanceRecord)
admin.site.register(HostelAuditLog, AuditAdminMixin)
admin.site.register(StudentSyncRun, AuditAdminMixin)
admin.site.register(Bed)
