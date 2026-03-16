# Split Attendance System (FN/AN Sessions)

## Overview

The attendance system now supports split sessions:
- **FN (Forenoon)**: Morning session
- **AN (Afternoon)**: Afternoon session

This allows for more granular tracking and half-day leave applications.

## Features

### 1. Attendance Time Limits

Configure three time limits in Attendance Settings:
- **In Time Limit**: 8:45 AM (default)
- **Mid Time Split**: 1:00 PM (default) - Separates FN and AN
- **Out Time Limit**: 5:00 PM (default)

### 2. Attendance Rules

#### FN (Forenoon) Status:
- **Present**: If staff arrives on or before 8:45 AM
- **Absent**: If staff arrives after 8:45 AM

#### AN (Afternoon) Status:
- **Present**: If staff arrives before 1:00 PM AND leaves at or after 5:00 PM
- **Absent**: If staff arrives after 1:00 PM OR leaves before 5:00 PM

#### Overall Status:
- **Present**: Both FN and AN are present
- **Half Day**: Only FN or AN is present
- **Absent**: Both FN and AN are absent

### 3. Calendar Display

**My Calendar** now shows:
- FN status (Green=Present, Red=Absent)
- AN status (Green=Present, Red=Absent)
- Time swap logic: If In time > Out time, they are swapped in display

Example:
```
In: 9:00 AM
Out: 5:30 PM
FN: absent (arrived after 8:45 AM)
AN: present (stayed until 5:00 PM)
```

### 4. Half-Day Leave Applications

Staff can now apply for half-day leaves using the **Shift** field:

#### Available Options:
- **Full Day**: Apply for both FN and AN
- **FN**: Apply for Forenoon only
- **AN**: Apply for Afternoon only

#### Supported Request Types:
- Casual Leave (CL)
- On Duty (OD)
- Compensatory Leave (COL)
- Late Entry Permission
- Medical Leave (ML)

### 5. Late Entry Permission

When FN or AN is marked absent, staff can:
1. Click the yellow "Apply" button on the calendar date
2. Select the request type (Late Entry, CL, OD, etc.)
3. **Select shift**: FN or AN
4. Submit for approval

On approval:
- Only the selected shift (FN or AN) will be updated from absent to present
- The other shift remains unchanged

## Usage Examples

### Example 1: Staff Arrives Late (9:30 AM)
- **FN Status**: Absent
- **AN Status**: Present (if they work until 5:00 PM)
- **Action**: Staff can apply "Late Entry Permission" for FN shift
- **After Approval**: FN changes to Present, overall status becomes "Present"

### Example 2: Half-Day Casual Leave
- Staff wants to take afternoon off
- **Application**: Apply CL for "AN" shift only
- **Result**: AN marked as leave, FN remains present
- **Overall Status**: Half Day

### Example 3: Full Day Leave
- **Application**: Apply CL for "Full Day"
- **Result**: Both FN and AN marked as leave
- **Overall Status**: Leave (CL)

### Example 4: Left Early (4:00 PM)
- **FN Status**: Present
- **AN Status**: Absent (left before 5:00 PM)
- **Action**: Staff can apply "Late Entry Permission" for AN shift or half-day leave
- **After Approval**: AN changes to Present or Leave as per request type

## For Administrators

### Adding Shift Field to Templates

Run the script to add shift field support:
```bash
cd backend
python scripts/add_shift_to_templates.py
```

This will add the shift selection dropdown to:
- Late Entry Permission (required field)
- Casual Leave (optional)
- On Duty (optional)
- Compensatory Leave (optional)
- Other leave templates

### Template Configuration

For templates that should update attendance:

```json
{
  "attendance_action": {
    "change_status": true,
    "from_status": "absent",
    "to_status": "present",
    "apply_to_dates": ["date"],
    "add_notes": true,
    "notes_template": "Late entry approved for {shift}"
  }
}
```

## Database Fields

### AttendanceRecord Model:
- `fn_status`: FN session status (present/absent/etc.)
- `an_status`: AN session status (present/absent/etc.)
- `status`: Overall status (calculated from FN and AN)

### AttendanceSettings Model:
- `attendance_in_time_limit`: Time limit for FN (default: 08:45:00)
- `mid_time_split`: Time that splits FN and AN (default: 13:00:00)
- `attendance_out_time_limit`: Time limit for AN (default: 17:00:00)

## API Changes

### Attendance Records Endpoint
`GET /api/staff-attendance/records/monthly_records/`

Returns:
```json
{
  "records": [
    {
      "id": 1,
      "date": "2026-03-11",
      "status": "half_day",
      "fn_status": "absent",
      "an_status": "present",
      "morning_in": "09:30",
      "evening_out": "17:15"
    }
  ]
}
```

### Request Form Data
When submitting requests with shift:
```json
{
  "date": "2026-03-11",
  "shift": "FN",
  "reason": "Late arrival due to traffic"
}
```

## Migration

To apply the database changes:
```bash
cd backend
python manage.py migrate staff_attendance
```

To add shift field to existing templates:
```bash
cd backend
python scripts/add_shift_to_templates.py
```

## Benefits

1. **Granular Tracking**: Track morning and afternoon attendance separately
2. **Flexible Leave**: Staff can apply for half-day leaves
3. **Accurate Records**: Better reflection of actual working hours
4. **Reduced Absences**: Staff can correct single-session absences
5. **Fair Policy**: Staff not penalized for entire day if only one session is affected

## Support

For issues or questions, contact the system administrator.
