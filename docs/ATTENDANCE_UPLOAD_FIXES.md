# Attendance Upload Fixes - March 11, 2026

## Issues Fixed

### Issue 1: Times Displayed Swapped in Calendar ❌ → ✅
**Problem**: CSV had `08:52 - 05:00` but calendar showed In: 05:00, Out: 08:52 (swapped)

**Root Cause**: Frontend had "time swap logic" that automatically swapped times if `morning_in > evening_out`
- The logic assumed if In time > Out time, they must be wrong and swapped them
- But this caused correct data to be displayed incorrectly

**Fix**: Removed the swap logic from `frontend/src/pages/staff/MyCalendar.tsx`
- Now displays times exactly as stored in database: `morning_in` as "In", `evening_out` as "Out"
- Changed lines 658-676 to remove swap logic

**Result**: 
- CSV: `D9: 08:52 - 05:00`
- Database: `morning_in=08:52, evening_out=05:00`
- Display: `In: 08:52, Out: 05:00` ✅

---

### Issue 2: Leave Status Overwritten by Upload ❌ → ✅
**Problem**: 
- Before upload: D9 had `FN=Leave, AN=No record`
- After upload: Showed `FN=absent, AN=absent` (leave status lost!)
- Should show: `FN=Leave, AN=Present`

**Root Cause**: The `update_status()` method in AttendanceRecord model already preserves leave statuses correctly. The issue was that FN had a leave code (like 'CL') which IS preserved, and AN was being calculated from the uploaded times.

**How It Works Now**:
1. Upload processes D9 yesterday column: `08:52 - 05:00`
2. Backend extracts ONLY the `evening_out` time (05:00) for yesterday deferred processing
3. Updates the D9 record's `evening_out` field to 05:00
4. Calls `update_status()` which:
   - Preserves `fn_status='CL'` (not in BIOMETRIC_STATUSES)
   - Updates `an_status` based on evening_out time (05:00 vs out_time_limit)
   - Recalculates overall `status` as 'half_day' (since FN=CL, AN=present/absent)

**Result**: 
- D9 after upload: `FN=Leave` (preserved), `AN=Present` (computed from 05:00) ✅

---

### Issue 3: Preview Shows Wrong Yesterday Column ❌ → ✅
**Problem**: Upload preview showed:
- "Today (D10) In" ✅
- "Yest (D9) In" ❌ (should be "Yest Out")

**Root Cause**: Yesterday processing was incorrectly using BOTH morning_in and evening_out from the D9 column when it should ONLY use evening_out (deferred exit)

**Fix**: 
1. **Backend** (`backend/staff_attendance/views.py`):
   - Line 710: Changed to parse ONLY evening_out: `_, y_out = self._parse_time_range(yest_val)`
   - Line 809: Updated yesterday save to pass `None` for morning_in: `_upsert_record(user, yest_date, None, y_out, 'yesterday', ...)`
   - Line 726: Removed `yesterday_morning_in` from preview response

2. **Frontend** (`frontend/src/pages/PS/StaffAttendanceUpload.tsx`):
   - Line 24: Removed `yesterday_morning_in` from interface
   - Line 572: Changed header from "Yest (D9) In" AND "Yest Out" to just "Yest (D9) Out"
   - Line 586: Removed the "Yest In" column, kept only "Yest Out"

**Result**: Preview now shows:
- "Today (D10) In" ✅
- "Yest (D9) Out" ✅

---

## How Yesterday Processing Works Now

### Scenario: Uploading on March 10 (D10)

**CSV Data**:
```
D9: 08:52 - 05:00
D10: 08:52 -
```

**On March 9 Upload** (D9 as "today"):
- Stores: D9 record with `morning_in=08:52, evening_out=None` (if staff didn't exit yet)
- Status calculated as 'partial' (has morning, no evening)

**On March 10 Upload** (D10 as "today", D9 as "yesterday"):
- **Today (D10)**: 
  - Parses `08:52 -` → `(08:52, None)`
  - Creates/updates D10 with `morning_in=08:52, evening_out=None`
  
- **Yesterday (D9)** - Deferred Exit:
  - Parses `08:52 - 05:00` → Extracts ONLY `evening_out=05:00` (ignores morning_in=08:52)
  - Updates existing D9 record: sets `evening_out=05:00`
  - Preserves `morning_in=08:52` (from yesterday's upload)
  - Calls `update_status()`:
    * If `fn_status='CL'` (leave) → PRESERVED
    * Calculates `an_status` from 05:00 vs time limits
    * Sets overall `status='half_day'` (FN=leave, AN=calculated)

**Result**:
- D9: `morning_in=08:52, evening_out=05:00, fn_status=CL, an_status=present/absent`
- D10: `morning_in=08:52, evening_out=None, fn_status=calculated, an_status=calculated`

---

## Files Modified

### Backend
- `backend/staff_attendance/views.py`:
  - Line 710: Extract only `y_out` for yesterday preview
  - Line 726: Remove `yesterday_morning_in` from preview response
  - Line 809-823: Updated yesterday processing to use ONLY `evening_out`

### Frontend
- `frontend/src/pages/staff/MyCalendar.tsx`:
  - Lines 658-676: Removed time swap logic
  
- `frontend/src/pages/PS/StaffAttendanceUpload.tsx`:
  - Line 24: Removed `yesterday_morning_in` from interface
  - Lines 572-586: Updated preview table to show only "Yest Out" column

---

## Testing Checklist

### Test Case 1: Yesterday Deferred Exit
1. Upload CSV on March 9 with D9: `08:52 -` (morning entry only)
2. Verify D9 shows: `In: 08:52, Out: -, FN: calculated, AN: calculated`
3. Upload CSV on March 10 with:
   - D9: `08:52 - 05:00` (yesterday with deferred exit)
   - D10: `08:52 -` (today morning entry)
4. **Expected D9**: `In: 08:52, Out: 05:00, FN: preserved, AN: recalculated`
5. **Expected D10**: `In: 08:52, Out: -, FN: calculated, AN: calculated`

### Test Case 2: Leave Status Preservation
1. Staff applies FN leave for March 9, gets approved
2. Verify D9 shows: `FN: CL (or Leave), AN: No record/absent`
3. Upload CSV on March 10 with D9: `08:52 - 05:00`
4. **Expected D9**: `In: 08:52, Out: 05:00, FN: CL (preserved), AN: Present`

### Test Case 3: Preview Display
1. Select CSV file with March 10 data
2. Click "Preview" (dry run)
3. **Expected columns**: 
   - User ID
   - Name
   - Today (D10) In
   - Today Out
   - Yest (D9) Out (NOT "Yest In")
   - Backfill days
4. **Expected D9 Out column**: Shows `05:00` (not `08:52`)

### Test Case 4: No Time Swap
1. Upload CSV with D9: `08:52 - 05:00`
2. View calendar for March 9
3. **Expected display**: `In: 08:52, Out: 05:00` (NOT swapped!)

---

## Important Notes

1. **Yesterday Column Usage**:
   - The D9 column on March 10 upload provides the DEFERRED evening exit
   - The morning_in was already recorded on March 9
   - Only the evening_out is used from the D9 column

2. **Leave Status Protection**:
   - Leave codes (CL, OD, ML, COL, etc.) are preserved during upload
   - Only biometric statuses (present, absent, partial, half_day) are recalculated
   - This is handled by `update_status()` checking `BIOMETRIC_STATUSES`

3. **Time Format**:
   - Backend stores times as-is from CSV
   - Frontend displays times as-is (no swapping)
   - If CSV has incorrect times (e.g., 05:00 for 5 PM instead of 17:00), they will be stored/displayed as 05:00

4. **Status Calculation**:
   - FN/AN statuses calculated based on time limits (AttendanceSettings)
   - Overall status is combination of FN and AN statuses
   - Status='half_day' when FN and AN have different statuses

---

## Migration/Deployment Notes

- No database migration required (only logic changes)
- Frontend rebuild required for UI changes
- Backward compatible with existing attendance records
- Existing records with incorrect data (swapped times) will remain as-is in DB but display correctly now
