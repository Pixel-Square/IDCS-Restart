# Late Entry Permission Feature - Implementation Summary

**Date:** March 9, 2026

## Overview
Implemented two key features:
1. **Late Entry Permission for Absent Days** - Staff can request permission for late entry on days marked as absent
2. **Dynamic Time Highlighting** - Calendar now uses configurable time limits from PS settings instead of hardcoded values

---

## Feature 1: Late Entry Permission for Absent Days

### Backend Changes

#### 1. Modified `staff_requests/views.py` - `filter_for_date` method
**Location:** Lines 247-267

**Change:**
- Previously: Blocked ALL forms when attendance status = 'absent'
- Now: Shows only permission forms with `attendance_action.change_status = True` for absent dates

```python
# For absent dates, only allow permission forms with attendance_action
if attendance and attendance.status == 'absent':
    # Find templates that can change attendance status (like Late Entry Permission)
    permission_templates = RequestTemplate.objects.filter(
        is_active=True,
        attendance_action__change_status=True
    )
    
    return Response({
        'templates': RequestTemplateSerializer(permission_templates, many=True).data,
        'message': 'Absent date - Only permission forms available',
        'is_holiday': is_holiday_or_sunday,
        'is_absent': True,
        'attendance_status': attendance.status,
        'total_available': permission_templates.count()
    })
```

**Effect:** Staff can now apply for Late Entry Permission when marked absent.

#### 2. Updated `staff_attendance/views.py` - `AttendanceSettingsViewSet`
**Location:** Line 1219

**Change:** Made the `current` action accessible to all authenticated users (not just PS)

```python
@action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
def current(self, request):
    """Get current attendance settings (create if doesn't exist) - Available to all staff"""
```

**Effect:** Staff can fetch attendance time limits for calendar highlighting.

---

## Feature 2: Dynamic Time Highlighting

### Frontend Changes

#### 1. Updated `MyCalendar.tsx` - Added AttendanceSettings Interface
**Location:** Lines 36-41

```typescript
interface AttendanceSettings {
  id: number;
  attendance_in_time_limit: string;
  attendance_out_time_limit: string;
  apply_time_based_absence: boolean;
}
```

#### 2. Added State and Fetching Logic
**Location:** Lines 48, 70, 85-99

```typescript
// State
const [attendanceSettings, setAttendanceSettings] = useState<AttendanceSettings | null>(null);

// Fetch on mount
useEffect(() => {
  // ... other fetches
  fetchAttendanceSettings();
}, [selectedYear, selectedMonth]);

// Fetch function
const fetchAttendanceSettings = async () => {
  try {
    const response = await apiClient.get(`${getApiBase()}/api/staff-attendance/settings/current/`);
    setAttendanceSettings(response.data);
  } catch (err) {
    // Use default values if fetch fails
    setAttendanceSettings({
      id: 1,
      attendance_in_time_limit: '08:45:00',
      attendance_out_time_limit: '17:45:00',
      apply_time_based_absence: true
    });
  }
};
```

#### 3. Updated Time Check Functions
**Location:** Lines 213-227

**Before:**
```typescript
const isTimeInLate = (timeStr?: string | null) => {
  const t = parseTime(timeStr);
  if (!t) return false;
  const cutoff = new Date('2000-01-01 08:45 AM');  // Hardcoded
  return t > cutoff;
};
```

**After:**
```typescript
const isTimeInLate = (timeStr?: string | null) => {
  const t = parseTime(timeStr);
  if (!t || !attendanceSettings) return false;
  // Parse attendance_in_time_limit (format: HH:MM:SS)
  const cutoff = new Date(`2000-01-01 ${attendanceSettings.attendance_in_time_limit}`);
  return t > cutoff;
};

const isTimeOutEarly = (timeStr?: string | null) => {
  const t = parseTime(timeStr);
  if (!t || !attendanceSettings) return false;
  // Parse attendance_out_time_limit (format: HH:MM:SS)
  const cutoff = new Date(`2000-01-01 ${attendanceSettings.attendance_out_time_limit}`);
  return t < cutoff;
};
```

**Effect:** Time highlighting now uses PS-configured limits instead of hardcoded values.

---

## Files Modified

### Backend Files:
1. ✅ `backend/staff_requests/views.py` 
   - Modified `filter_for_date` method (lines 247-267)
   
2. ✅ `backend/staff_attendance/views.py`
   - Updated `AttendanceSettingsViewSet.current` action (line 1219)

### Frontend Files:
1. ✅ `frontend/src/pages/staff/MyCalendar.tsx`
   - Added `AttendanceSettings` interface
   - Added state management
   - Added fetch logic
   - Updated time checking functions
   - Already has "Late Entry" button on absent days (implemented previously)

---

## Testing Guide

### Test 1: Late Entry Permission on Absent Days

1. **Setup:**
   - Ensure a staff member has at least one day marked as "absent"
   - Navigate to: Staff Portal → My Calendar

2. **Expected Behavior:**
   - Calendar shows absent day with red background
   - Yellow "⚠ Late Entry" button appears on absent day
   - Clicking date OR "Late Entry" button opens request modal

3. **Request Submission:**
   - Modal shows "Absent date - Only permission forms available" message
   - Only "Late Entry Permission" template is visible
   - Date field is pre-filled
   - Fill: Shift (morning/evening), Duration (10min-2hr), Reason
   - Submit request

4. **HOD Approval:**
   - Login as HOD
   - Navigate to: Pending Approvals
   - Find and approve the late entry request

5. **Verification:**
   - Go back to staff calendar
   - Absent day should now show "Present" status
   - Check attendance notes for permission details

### Test 2: Dynamic Time Highlighting

1. **PS Settings Configuration:**
   - Login as PS/Principal Secretary
   - Navigate to: PS Portal → Attendance Settings
   - Current limits should show (default: In=08:45:00, Out=17:45:00)
   - Change values (e.g., In=09:00:00, Out=17:30:00)
   - Save changes

2. **Staff Calendar Check:**
   - Login as staff member
   - Navigate to: My Calendar
   - View days with attendance data

3. **Expected Behavior:**
   - Times AFTER the configured in-time should be highlighted RED
   - Times BEFORE the configured out-time should be highlighted RED
   - Example: If in-time = 09:00, arrival at 09:15 shows in RED

4. **Verification:**
   - Check browser console: Should see successful fetch of settings
   - Highlighting should match PS-configured limits, not hardcoded 08:45/17:45

---

## API Endpoints Used

### Backend Endpoints:

1. **Get Attendance Settings:**
   ```
   GET /api/staff-attendance/settings/current/
   Permission: IsAuthenticated (all staff)
   Response: {
     id: 1,
     attendance_in_time_limit: "08:45:00",
     attendance_out_time_limit: "17:45:00",
     apply_time_based_absence: true
   }
   ```

2. **Filter Templates by Date:**
   ```
   POST /api/staff-requests/templates/filter_for_date/
   Body: { date: "2026-03-09" }
   Response: {
     templates: [...],
     message: "Absent date - Only permission forms available",
     is_absent: true,
     attendance_status: "absent",
     total_available: 1
   }
   ```

3. **Submit Late Entry Request:**
   ```
   POST /api/staff-requests/requests/
   Body: {
     template_id: <late_entry_template_id>,
     form_data: {
       date: "2026-03-09",
       shift: "morning",
       late_duration: "60",
       reason: "Traffic delay"
     }
   }
   ```

4. **Process Approval (HOD):**
   ```
   POST /api/staff-requests/requests/<request_id>/process_approval/
   Body: {
     action: "approve",
     comments: "Approved"
   }
   Effect: Calls _process_attendance_action → Changes absent → present
   ```

---

## Configuration

### Attendance Settings (PS Portal):
- **In-Time Limit:** Default 08:45:00 (HH:MM:SS format)
- **Out-Time Limit:** Default 17:45:00 (HH:MM:SS format)
- **Apply Time-Based Absence:** Default true

### Late Entry Permission Template:
- **Form Fields:**
  - Date (date picker)
  - Shift (morning/evening select)
  - Late Duration (10/30/60/90/120 mins select)
  - Reason (textarea)
- **Approval Workflow:** HOD approval
- **Attendance Action:**
  - change_status: true
  - from_status: "absent"
  - to_status: "present"
  - apply_to_dates: ["date"]
  - add_notes: true
  - notes_template: "Late Entry Permission: {shift} shift, {late_duration} mins late"

---

## Troubleshooting

### Issue: Late Entry button not showing on absent days
**Solution:** 
1. Verify Late Entry Permission template exists: `python manage.py seed_late_entry_template`
2. Check template is active in HR portal
3. Verify attendance_action is configured correctly

### Issue: Time highlighting not working
**Solution:**
1. Check browser console for fetch errors
2. Verify `/api/staff-attendance/settings/current/` returns data
3. Check attendance settings exist in database
4. Clear browser cache and reload

### Issue: Cannot submit request on absent date
**Solution:**
1. Verify backend filter_for_date returns permission templates
2. Check attendance_action.change_status = true in template
3. Verify template is active

### Issue: Attendance not changing after approval
**Solution:**
1. Check `_process_attendance_action` method in staff_requests/views.py
2. Verify template has attendance_action configured
3. Check logs for errors during approval processing

---

## Success Criteria

✅ Staff can see "Late Entry" button on absent days  
✅ Clicking button opens modal with Late Entry Permission form only  
✅ Request submits successfully  
✅ HOD can approve request  
✅ Attendance status changes from absent → present on approval  
✅ Calendar time highlighting uses PS-configured limits  
✅ Changing PS settings updates calendar highlighting dynamically  

---

## Next Steps

1. **Testing:** Conduct thorough testing with real users
2. **Monitoring:** Monitor approval logs for late entry requests
3. **Feedback:** Collect user feedback on the feature
4. **Documentation:** Update user manuals with new workflow
5. **Training:** Train HODs on late entry approval process

---

## Notes

- Default time limits remain 08:45 and 17:45 if PS hasn't configured custom values
- Late entry requests only visible for absent dates (not partial/half_day)
- Multiple permission templates can be created with attendance_action feature
- Calendar automatically refreshes settings on each month navigation
