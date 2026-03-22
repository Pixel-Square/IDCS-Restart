# Department-Specific Attendance Time Limits

**Date:** March 16, 2026

## Overview

Added support for department-specific attendance time limit configurations. PS (Personal Secretary) can now create multiple time limit "types" and assign them to different sets of departments. For example:
- **Type 1** (in_time: 08:45, out_time: 17:00) for CSE, Mech
- **Type 2** (in_time: 08:30, out_time: 17:30) for EEE, ECE

## Architecture

### 1. New Model: `DepartmentAttendanceSettings`

Located in `staff_attendance/models.py`

**Fields:**
- `name` (CharField): Configuration name (e.g., "Type 1", "Engineering Depts")
- `description` (TextField): Description of which departments use these settings
- `attendance_in_time_limit` (TimeField): In-time limit (default: 08:45)
- `attendance_out_time_limit` (TimeField): Out-time limit (default: 17:00)
- `mid_time_split` (TimeField): FN/AN split time (default: 13:00)
- `apply_time_based_absence` (BooleanField): Enable/disable time-based marking
- `departments` (ManyToManyField): Departments assigned to this configuration
- `enabled` (BooleanField): Enable/disable this configuration
- `created_by`, `updated_by`: Audit fields
- `created_at`, `updated_at`: Timestamps

**Key Feature:** Multiple departments can share one configuration type, and configurations can be enabled/disabled without deleting them.

### 2. Updated Model: `AttendanceRecord`

The `update_status()` method now:
1. Checks if user's department has a department-specific configuration
2. Falls back to global `AttendanceSettings` if no department config exists
3. Uses defaults (08:45, 17:00, 13:00) as last resort

**Priority:**
```
Department-Specific Settings → Global Settings → Defaults
```

### 3. New ViewSet: `DepartmentAttendanceSettingsViewSet`

Accessible at: `/api/staff-attendance/department-settings/`

**Permissions:** PS (Personal Secretary) only (uses `StaffAttendanceUploadPermission`)

**Actions:**
- `GET /department-settings/` - List all configurations
- `POST /department-settings/` - Create new configuration
- `PATCH /department-settings/{id}/` - Update configuration
- `DELETE /department-settings/{id}/` - Delete configuration
- `GET /department-settings/for_my_department/` - Get settings for current user's department

**Filters:** By `enabled` status and `departments`

**Search:** By `name` and `description`

### 4. Updated Endpoints

#### `/api/staff-attendance/settings/current/`

Now returns department-specific settings if available:

**Response (Department-Specific):**
```json
{
  "id": 1,
  "name": "Type 1 - CSE/Mech",
  "description": "Engineering departments",
  "attendance_in_time_limit": "08:45:00",
  "attendance_out_time_limit": "17:00:00",
  "mid_time_split": "13:00:00",
  "apply_time_based_absence": true,
  "enabled": true,
  "departments_info": [
    {"id": 1, "name": "Computer Science", "code": "CSE"},
    {"id": 2, "name": "Mechanical", "code": "MECH"}
  ],
  "is_department_specific": true,
  "created_by": "ps_user"
}
```

**Response (Global Settings Fallback):**
```json
{
  "id": 1,
  "attendance_in_time_limit": "08:45:00",
  "attendance_out_time_limit": "17:45:00",
  "mid_time_split": "13:00:00",
  "apply_time_based_absence": true,
  "is_department_specific": false
}
```

### 5. Admin Interface

New admin class: `DepartmentAttendanceSettingsAdmin`

**Features:**
- Multi-select `departments` field to assign multiple departments
- Display departments as codes in list view
- Filter by enabled status, creation date, and department
- Search by name and description
- Readonly fields for audit information

**Access:** Django admin (`/admin/staff_attendance/departmentattendancesettings/`)

## Usage Flow

### Setup (PS Steps)

1. **Navigate to Django Admin:**
   - URL: `/admin/staff_attendance/departmentattendancesettings/`

2. **Create Configuration Type 1:**
   - Name: "Type 1 - Engineering"
   - In-time: 08:45
   - Out-time: 17:00
   - Departments: CSE, Mechanical
   - Enabled: ✓

3. **Create Configuration Type 2:**
   - Name: "Type 2 - Science"
   - In-time: 08:30
   - Out-time: 17:30
   - Departments: EEE, ECE
   - Enabled: ✓

### Attendance Marking (Automatic)

When staff attendance is processed:
1. System finds user's department
2. Looks up time limits for that department
3. Uses department-specific or global settings
4. Marks FN/AN status based on applicable time limits

### Calendar Display (Frontend)

Frontend automatically fetches department-specific settings from `/api/staff-attendance/settings/current/` and uses them for highlighting late entries in the calendar.

## Database Migration

**File:** `staff_attendance/migrations/0011_add_department_attendance_settings.py`

**To Apply:**
```bash
python manage.py migrate staff_attendance
```

## API Examples

### Create Department Settings

```bash
curl -X POST http://localhost:8000/api/staff-attendance/department-settings/ \
  -H "Authorization: Bearer <PS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Type 1",
    "description": "CSE and Mechanical departments",
    "attendance_in_time_limit": "08:45:00",
    "attendance_out_time_limit": "17:00:00",
    "mid_time_split": "13:00:00",
    "apply_time_based_absence": true,
    "departments": [1, 2],
    "enabled": true
  }'
```

### List Department Settings

```bash
curl http://localhost:8000/api/staff-attendance/department-settings/ \
  -H "Authorization: Bearer <PS_TOKEN>"
```

### Get Settings for My Department

```bash
curl http://localhost:8000/api/staff-attendance/department-settings/for_my_department/ \
  -H "Authorization: Bearer <STAFF_TOKEN>"
```

### Get Current Applicable Settings

```bash
curl http://localhost:8000/api/staff-attendance/settings/current/ \
  -H "Authorization: Bearer <ANY_STAFF_TOKEN>"
```

## Backward Compatibility

✅ **Fully backward compatible:**
- Global `AttendanceSettings` still exists and works
- If no department-specific settings exist, system uses global settings
- Existing code paths unchanged
- No breaking changes to APIs

## Testing Checklist

- [ ] Create department-specific settings in admin
- [ ] Assign multiple departments to one configuration
- [ ] Verify attendance records use department-specific times
- [ ] Verify calendar shows correct time limits per user's department
- [ ] Test fallback to global settings when no department config exists
- [ ] Verify PS can create/edit/delete configurations
- [ ] Verify other roles cannot access configuration endpoints
- [ ] Test `for_my_department/` endpoint for different departments
- [ ] Verify disabled configurations are not used

## Future Enhancements

1. **Time-based batch updates** - Automatically disable old configurations after date
2. **Template sharing** - Copy settings from one configuration to another
3. **Academic year linking** - tie configurations to academic years
4. **Department override** - Allow departments to temporarily override settings
5. **Detailed audit log** - Track who changed what and when

## Files Modified

1. `backend/staff_attendance/models.py` - Added `DepartmentAttendanceSettings` model, updated `AttendanceRecord.update_status()`
2. `backend/staff_attendance/serializers.py` - Added `DepartmentAttendanceSettingsSerializer`
3. `backend/staff_attendance/views.py` - Added `DepartmentAttendanceSettingsViewSet`, updated `AttendanceSettingsViewSet.current()`
4. `backend/staff_attendance/admin.py` - Added `DepartmentAttendanceSettingsAdmin`
5. `backend/staff_attendance/urls.py` - Registered new viewset
6. `backend/staff_attendance/migrations/0011_add_department_attendance_settings.py` - Database migration

## Summary

Staff now have accurate, department-specific attendance time limits:
- PS controls which departments get which time limits
- No more conflicts between departments with different schedules
- Fully configurable without code changes
- Admin-friendly setup and management
