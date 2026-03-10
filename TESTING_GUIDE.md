# Quick Testing Guide - Late Entry Feature

## 🚀 Quick Start Testing

### Prerequisites
- Backend server running on port 8000
- Frontend running on port 5173
- Late Entry Permission template seeded (already done)
- At least one staff account with absent days

---

## Test 1: Late Entry Permission (5 minutes)

### Step 1: Create Absent Day (if needed)
```bash
# As PS, upload a CSV or manually mark a staff absent for today
# OR use existing absent days in the system
```

### Step 2: Staff View Calendar
1. Login as Staff
2. Navigate to: **My Calendar** (`/staff/my-calendar`)
3. Look for days with red background (absent)
4. **Expected:** Yellow "⚠ Late Entry" button appears

### Step 3: Submit Late Entry Request
1. Click the **"Late Entry"** button
2. **Expected:** Modal opens showing:
   - Message: "Absent date - Only permission forms available"
   - Only "Late Entry Permission" template visible
   - Date field pre-filled
3. Fill form:
   - **Shift:** Morning or Evening
   - **Duration:** 60 minutes (e.g.)
   - **Reason:** "Traffic delay" (e.g.)
4. Click **Submit**
5. **Expected:** Success message, modal closes, request appears in "My Requests" section

### Step 4: HOD Approval
1. Login as HOD
2. Navigate to: **Pending Approvals**
3. Find the late entry request
4. Click **Approve** with comment: "Approved"
5. **Expected:** Success message

### Step 5: Verify Attendance Change
1. Go back to Staff Calendar (or refresh)
2. Check the previously absent day
3. **Expected:** 
   - Status changed from "Absent" to "Present"
   - Attendance notes show: "Late Entry Permission: morning shift, 60 mins late"

---

## Test 2: Dynamic Time Highlighting (3 minutes)

### Step 1: Check Current Settings
```bash
# API Test (optional)
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/staff-attendance/settings/current/
```

### Step 2: Verify Default Highlighting
1. Login as Staff
2. Navigate to: **My Calendar**
3. **Expected Legend Box shows:**
   - "Time Limits: In-time after 08:45:00 or Out-time before 17:45:00 highlighted in red"
4. Find a day with late arrival (e.g., 09:00 AM)
5. **Expected:** In-time shows in **RED**

### Step 3: Change Settings (PS Only)
1. Login as PS
2. Navigate to: **PS Portal → Attendance Settings**
3. Change:
   - **In-Time Limit:** 09:00:00
   - **Out-Time Limit:** 17:30:00
4. Click **Save**

### Step 4: Verify Dynamic Update
1. Go back to Staff Calendar
2. Navigate to different month and back (triggers refresh)
3. **Expected Legend Box now shows:**
   - "Time Limits: In-time after 09:00:00 or Out-time before 17:30:00..."
4. Previous 09:00 AM arrival should now be **GREEN** (not late anymore)
5. New threshold applies immediately

---

## Test 3: Permission Filtering (2 minutes)

### Step 1: Test Holiday Date
1. As Staff, click on a Sunday or Holiday
2. **Expected:** Only "Earn" forms visible (COL claim, etc.)

### Step 2: Test Working Day
1. Click on a regular working day (not absent)
2. **Expected:** "Deduct/Neutral" forms visible (Leave, OD, etc.)

### Step 3: Test Absent Day
1. Click on an absent day
2. **Expected:** Only "Late Entry Permission" visible
3. **Message:** "Absent date - Only permission forms available"

---

## Expected Results Summary

| Test Case | Expected Result | Status |
|-----------|----------------|--------|
| Late Entry button on absent days | ✅ Yellow button visible | |
| Click Late Entry opens modal | ✅ Modal with pre-filled date | |
| Only permission forms on absent | ✅ Late Entry Permission only | |
| Submit request | ✅ Creates pending request | |
| HOD approve changes status | ✅ Absent → Present | |
| Notes added to attendance | ✅ Permission details in notes | |
| Time limits from PS settings | ✅ Dynamic, not hardcoded | |
| Legend shows current limits | ✅ Displays from API | |
| Changing PS settings updates UI | ✅ New limits apply instantly | |
| Info banner for absent days | ✅ Yellow banner with guide | |

---

## API Verification Commands

### Get Current Settings:
```bash
curl http://localhost:8000/api/staff-attendance/settings/current/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Filter Templates for Absent Date:
```bash
curl -X POST http://localhost:8000/api/staff-requests/templates/filter_for_date/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-03-09"}'
```

### Expected Response:
```json
{
  "templates": [
    {
      "id": 4,
      "name": "Late Entry Permission",
      "attendance_action": {
        "change_status": true,
        "from_status": "absent",
        "to_status": "present",
        "apply_to_dates": ["date"]
      }
    }
  ],
  "message": "Absent date - Only permission forms available",
  "is_absent": true,
  "attendance_status": "absent",
  "total_available": 1
}
```

---

## Troubleshooting

### Issue: No Late Entry button
**Check:**
```bash
# Verify template exists
python manage.py shell
>>> from staff_requests.models import RequestTemplate
>>> RequestTemplate.objects.filter(name='Late Entry Permission').exists()
True
```

### Issue: Time limits not updating
**Check:**
1. Open browser console (F12)
2. Go to Network tab
3. Navigate calendar
4. Look for: `/api/staff-attendance/settings/current/`
5. Should return 200 with settings JSON

### Issue: 403 Forbidden on settings
**Fix:** Already fixed! The `current` action now has `permission_classes=[IsAuthenticated]`

### Issue: Approval doesn't change attendance
**Check:**
1. Verify template has `attendance_action` configured
2. Check backend logs for errors during `_process_attendance_action`
3. Verify attendance record exists for that date

---

## Quick Demo Script (30 seconds)

```bash
# 1. Open Staff Calendar
# 2. Point to red absent day
# 3. Click yellow "Late Entry" button
# 4. Show pre-filled form
# 5. Submit in 3 clicks
# 6. Show in pending requests
# 7. Switch to HOD, approve
# 8. Back to calendar - now green (present)
```

---

## Success Indicators

✅ Yellow info banner appears when absent days exist  
✅ Calendar legend shows current time limits  
✅ Late Entry button on all absent days  
✅ Request submission in 3 clicks  
✅ Status change visible immediately after approval  
✅ Time highlighting matches PS configuration  

---

## Notes

- Feature works with existing attendance records
- No database migrations needed (already applied)
- Works with all existing leave/request features
- Template can be customized by HR in template editor
- Time limits configurable by PS in Attendance Settings

**Ready to demo! 🎉**
