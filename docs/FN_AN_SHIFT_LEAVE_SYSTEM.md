# FN/AN Shift-Based Leave Application System

## Overview
This feature allows staff to apply for leave with granular control over Forenoon (FN) and Afternoon (AN) sessions. Staff can now apply for:
- Full day leave (both FN and AN)
- Half day leave (FN only or AN only)
- Date range with different shifts (e.g., 11th March AN to 12th March FN)

## Key Features

### 1. **Flexible Date Range with Session Selection**
   - Staff can select `from_date` (required) and `to_date` (optional)
   - Each date must have a session selection:
     - `from_noon`: **FN** or **AN** (required)
     - `to_noon`: **FN** or **AN** (optional, used with to_date)
   - Examples:
     - Single session: `from_date` + `from_noon` (e.g., "11th March FN")
     - Date range: `from_date` + `from_noon` + `to_date` + `to_noon` (e.g., "11th March AN to 12th March FN")

### 2. **Half-Day Leave Support**
   - When staff applies for only FN or AN session, the attendance status shows `half_day`
   - Calendar displays "HALF DAY" badge when only one session has leave
   - FN and AN status shown separately with leave type labels

### 3. **Calendar Display Enhancements**
   - FN/AN sessions show leave type abbreviations:
     - `CL` → "Cas.Leave"
     - `OD` → "On Duty"
     - `COL` → "Comp Off"
     - `ML` → "Med.Leave"
   - Half-day indicator badge displayed below FN/AN status
   - Color coding:
     - Green: Present
     - Red: Absent
     - Purple: Leave/OD status
     - Yellow: Partial/Other

## Implementation Details

### Backend Changes

#### 1. Updated `_process_attendance_action()` in `staff_requests/views.py`
   - Now handles `from_noon` and `to_noon` fields from form data (backward compatible with old `from_shift`/`to_shift`)
   - Supports date range processing with session-specific updates
   - Logic for session handling:
     ```
     - Single date with session: Updates only specified session (FN or AN)
     - Date range with from_noon/to_noon:
       * First date: Apply from_noon session
       * Last date: Apply to_noon session
       * Middle dates: Full day
       * Same date (from_date == to_date): Apply both sessions if both specified
     ```
   - Recalculates overall status:
     ```python
     if fn_status == to_status and an_status == to_status:
         overall_status = to_status  # Full day leave (CL, OD, etc.)
     elif fn_status == to_status or an_status == to_status:
         overall_status = 'half_day'  # Half day
     else:
         overall_status = 'absent'
     ```

#### 2. Script: `fix_template_noon_fields.py`
   - Automatically adds standardized date/session fields to all templates
   - Removes duplicate fields (shift, from_shift, to_shift, etc.)
   - Field structure:
     ```json
     {
       "name": "from_date",
       "type": "date",
       "label": "From Date",
       "required": true,
       "help_text": "Start date of leave/request"
     },
     {
       "name": "from_noon",
       "type": "select",
       "label": "From Noon",
       "required": true,
       "options": [
         {"value": "FN", "label": "Forenoon (FN)"},
         {"value": "AN", "label": "Afternoon (AN)"}
       ],
       "help_text": "Select FN (morning) or AN (afternoon) for start date"
     },
     {
       "name": "to_date",
       "type": "date",
       "label": "To Date",
       "required": false,
       "help_text": "End date (optional, leave empty for same day)"
     },
     {
       "name": "to_noon",
       "type": "select",
       "label": "To Noon",
       "required": false,
       "options": [
         {"value": "FN", "label": "Forenoon (FN)"},
         {"value": "AN", "label": "Afternoon (AN)"}
       ],
       "help_text": "Select FN or AN for end date (optional)"
     }
     ```

### Frontend Changes

#### 1. Calendar Display (`MyCalendar.tsx`)
   - Added `isHalfDayLeave` detection logic
   - Enhanced FN/AN status display with leave type labels
   - Added "HALF DAY" badge for half-day leaves
   - Color-coded sessions based on status

#### 2. Form Rendering (Dynamic Forms)
   - Session fields automatically rendered based on template schema
   - `from_noon` dropdown with FN/AN options (required)
   - `to_noon` dropdown with FN/AN options (optional, used with to_date)
   - Required structure: from_date + from_noon (required), to_date + to_noon (optional)

## Usage Examples

### Example 1: Full Day Leave
**Form Data:**
```json
{
  "from_date": "2026-03-11",
  "to_date": "2026-03-12"
}
```
**Result:** Both FN and AN marked as CL for March 11 and 12

---

### Example 2: Half Day Leave (FN only)
**Form Data:**
```json
{
  "from_date": "2026-03-11",
  "from_noon": "FN"
}
```
**Result:** 
- March 11: FN = CL, AN = absent, Overall = half_day
- Calendar shows "HALF DAY" badge

---

### Example 3: Date Range with Different Sessions
**Form Data:**
```json
{
  "from_date": "2026-03-11",
  "from_noon": "AN",
  "to_date": "2026-03-12",
  "to_noon": "FN"
}
```
**Result:** 
- March 11: FN = present/absent, AN = CL, Overall = half_day
- March 12: FN = CL, AN = present/absent, Overall = half_day
- Calendar shows "HALF DAY" for both dates

---

### Example 4: Multi-Day Leave with Partial Days
**Form Data:**
```json
{
  "from_date": "2026-03-11",
  "from_noon": "AN",
  "to_date": "2026-03-15",
  "to_noon": "FN"
}
```
**Result:**
- March 11: AN = CL (half day)
- March 12, 13, 14: Full day CL
- March 15: FN = CL (half day)

## Database Schema

### AttendanceRecord Model
- `status`: Overall attendance status (present, absent, half_day, CL, OD, COL, ML, etc.)
- `fn_status`: Forenoon session status
- `an_status`: Afternoon session status

### Status Values
- `present`: Attended
- `absent`: Not attended
- `half_day`: One session attended, one session absent or leave
- `CL`, `OD`, `COL`, `ML`, etc.: Leave types (can be full day or half day)

## Migration Steps

### To Enable This Feature:
1. **Update backend code** (already done):
   - `staff_requests/views.py` with updated `_process_attendance_action()`

2. **Run template standardization script**:
   ```bash
   cd backend
   python scripts/fix_template_noon_fields.py
   ```

3. **Update frontend** (already done):
   - `MyCalendar.tsx` with enhanced display logic

4. **Test the feature**:
   - Apply for leave with FN/AN shifts
   - Verify calendar display
   - Check attendance records in admin

## Backward Compatibility
- Backend code supports both old (`from_shift`/`to_shift`) and new (`from_noon`/`to_noon`) field names
- Old requests with no session data are treated as full-day
- Attendance records with only `status` field work correctly
- Existing templates are automatically updated to use new field names

## Admin Interface
- Attendance admin shows FN and AN columns
- Bulk edit supports updating individual sessions
- Filters available for half_day status

## API Endpoints

### Staff Request Submission
```
POST /api/staff-requests/requests/
Body: {
  "template_id": 1,
  "form_data": {
    "from_date": "2026-03-11",
    "from_noon": "AN",
    "to_date": "2026-03-12",
    "to_noon": "FN",
    "reason": "Personal work"
  }
}
```

### Attendance Records
```
GET /api/staff-attendance/records/monthly_records/?year=2026&month=3
Response includes:
{
  "records": [
    {
      "date": "2026-03-11",
      "status": "half_day",
      "fn_status": "present",
      "an_status": "CL",
      ...
    }
  ]
}
```

## Testing Checklist
- [ ] Apply full day leave (both dates, no shift)
- [ ] Apply FN-only leave (shows half_day)
- [ ] Apply AN-only leave (shows half_day)
- [ ] Apply date range with different shifts (11 AN to 12 FN)
- [ ] Calendar displays "HALF DAY" badge correctly
- [ ] FN/AN labels show leave type abbreviations
- [ ] Attendance admin shows correct FN/AN status
- [ ] HOD approval updates attendance correctly
- [ ] Multiple half-day leaves accumulate correctly

## Troubleshooting

### Issue: Calendar not showing half-day
**Solution:** Refresh browser cache, check attendance record has `status='half_day'`

### Issue: Both sessions marked as leave when only one selected
**Solution:** Verify shift field value in form_data (should be 'FN' or 'AN', not empty)

### Issue: Form doesn't show shift fields
**Solution:** Run `add_shift_fields_to_templates.py` script again

## Future Enhancements
- [ ] Add shift-based leave balance tracking
- [ ] Reports filtered by FN/AN sessions
- [ ] Shift-wise attendance analytics
- [ ] Bulk apply shift-based leaves
- [ ] Mobile app support for shift selection

---

**Version:** 1.0  
**Date:** March 11, 2026  
**Author:** System Implementation
